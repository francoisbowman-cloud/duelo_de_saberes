import { randomBytes, randomUUID } from "node:crypto";
import type { GameState, PlayerState, PublicQuestion, RoomState } from "@duelo/shared";
import { questions, type Question } from "./questions.js";

type InternalPlayer = PlayerState & { sessionToken: string; socketId: string | null };
type InternalRoom = Omit<RoomState, "players"> & {
  players: InternalPlayer[];
  questionOrder: string[];
  timer?: NodeJS.Timeout;
};

export type EngineEvent =
  | { type: "state"; room: RoomState }
  | { type: "question"; room: RoomState; question: PublicQuestion }
  | { type: "reveal"; room: RoomState; correct: boolean; playerId: string | null; correctAnswer: string; fact: string }
  | { type: "finished"; room: RoomState };

export class GameError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const shuffled = <T>(items: T[]) => {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) {
    const target = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[target]] = [copy[target]!, copy[index]!];
  }
  return copy;
};
const publicRoom = (room: InternalRoom): RoomState => ({
  id: room.id,
  code: room.code,
  status: room.status,
  createdAt: room.createdAt,
  updatedAt: room.updatedAt,
  maxPlayers: room.maxPlayers,
  players: room.players.map(({ sessionToken: _token, socketId: _socket, ...player }) => player),
  game: room.game,
});

export class GameEngine {
  private rooms = new Map<string, InternalRoom>();
  private onEvent: ((event: EngineEvent) => void) | null = null;

  constructor(
    private now = () => Date.now(),
    private questionMs = 30_000,
    private stealMs = 10_000,
    private revealMs = 6_000,
    private questionBank: Question[] = questions,
  ) {}

  setEventListener(listener: (event: EngineEvent) => void) { this.onEvent = listener; }

  createRoom(displayName: string, socketId: string) {
    let code = "";
    do code = randomBytes(5).toString("base64url").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6).padEnd(6, "X"); while (this.rooms.has(code));
    const timestamp = this.timestamp();
    const room: InternalRoom = {
      id: randomUUID(), code, status: "lobby", createdAt: timestamp, updatedAt: timestamp,
      maxPlayers: 4, players: [], game: null, questionOrder: shuffled(this.questionBank.map((question) => question.id)),
    };
    this.rooms.set(code, room);
    return this.addPlayer(room, displayName, socketId);
  }

  joinRoom(code: string, displayName: string, socketId: string) {
    const room = this.requireRoom(code);
    if (room.status !== "lobby") throw new GameError("GAME_ALREADY_STARTED", "La partida ya comenzó");
    if (room.players.length >= room.maxPlayers) throw new GameError("ROOM_FULL", "La sala ya tiene cuatro jugadores");
    return this.addPlayer(room, displayName, socketId);
  }

  rejoinRoom(code: string, token: string, socketId: string) {
    const room = this.requireRoom(code);
    const player = room.players.find((candidate) => candidate.sessionToken === token);
    if (!player) throw new GameError("INVALID_SESSION", "No fue posible recuperar tu lugar en la partida");
    const replacedSocketId = player.socketId && player.socketId !== socketId ? player.socketId : null;
    player.socketId = socketId;
    player.connected = true;
    player.disconnectedAt = null;
    room.updatedAt = this.timestamp();
    return { room: publicRoom(room), playerId: player.id, sessionToken: player.sessionToken, replacedSocketId };
  }

  startGame(code: string, playerId: string) {
    const room = this.requireMember(code, playerId);
    if (room.status !== "lobby") throw new GameError("INVALID_PHASE", "La partida ya comenzó");
    if (!room.players.some((player) => player.connected)) throw new GameError("NO_PLAYERS", "No hay jugadores conectados");
    room.status = "playing";
    room.game = {
      questionIndex: 0, round: 1, phase: "question", activePlayerId: null,
      currentQuestionId: null, attemptedPlayerIds: [], deadlineAt: null,
      remainingMs: this.questionMs, eventSequence: 0,
    };
    this.beginQuestion(room);
    return publicRoom(room);
  }

  submitAnswer(code: string, playerId: string, answer: string | number, eventSequence: number) {
    const room = this.requireMember(code, playerId);
    const game = this.requireGame(room);
    if (game.phase !== "question" && game.phase !== "steal") throw new GameError("INVALID_PHASE", "No se aceptan respuestas en esta fase");
    if (game.eventSequence !== eventSequence) throw new GameError("STALE_EVENT", "La pregunta ya cambió");
    if (game.attemptedPlayerIds.includes(playerId)) throw new GameError("DUPLICATE_ANSWER", "Ya respondiste esta pregunta");
    if (game.activePlayerId !== playerId) throw new GameError("NOT_YOUR_TURN", "No es tu turno");
    if (!game.deadlineAt || this.now() >= Date.parse(game.deadlineAt)) throw new GameError("TIME_EXPIRED", "El tiempo terminó");

    const question = this.getQuestion(game.currentQuestionId);
    const correct = this.isCorrect(question, answer);
    const player = room.players.find((candidate) => candidate.id === playerId)!;
    game.attemptedPlayerIds.push(playerId);
    if (correct) {
      player.score += 1;
      player.streak += 1;
      this.beginReveal(room, true, playerId);
    } else {
      player.streak = 0;
      this.advanceTurnOrReveal(room);
    }
    room.updatedAt = this.timestamp();
    return { correct, question, room: publicRoom(room) };
  }

  disconnect(socketId: string) {
    for (const room of this.rooms.values()) {
      const player = room.players.find((candidate) => candidate.socketId === socketId);
      if (!player) continue;
      player.connected = false;
      player.socketId = null;
      player.disconnectedAt = this.timestamp();
      room.updatedAt = player.disconnectedAt;
      const game = room.game;
      if (game && room.status === "playing" && game.activePlayerId === player.id && (game.phase === "question" || game.phase === "steal")) {
        if (!game.attemptedPlayerIds.includes(player.id)) game.attemptedPlayerIds.push(player.id);
        this.advanceTurnOrReveal(room);
      }
      return publicRoom(room);
    }
    return null;
  }

  getRoom(code: string) { return publicRoom(this.requireRoom(code)); }
  getPublicQuestion(code: string): PublicQuestion {
    const game = this.requireGame(this.requireRoom(code));
    const question = this.getQuestion(game.currentQuestionId);
    return { id: question.id, category: question.category, prompt: question.prompt, type: question.type, options: question.options };
  }

  private addPlayer(room: InternalRoom, displayName: string, socketId: string) {
    const timestamp = this.timestamp();
    const player: InternalPlayer = {
      id: randomUUID(), sessionToken: randomBytes(32).toString("base64url"), socketId,
      displayName, connected: true, score: 0, streak: 0, position: room.players.length + 1,
      joinedAt: timestamp, disconnectedAt: null,
    };
    room.players.push(player);
    room.updatedAt = timestamp;
    return { room: publicRoom(room), playerId: player.id, sessionToken: player.sessionToken, replacedSocketId: null };
  }

  private beginQuestion(room: InternalRoom) {
    const game = this.requireGame(room);
    const questionId = room.questionOrder[game.questionIndex];
    if (!questionId) return this.finishGame(room);
    const connected = room.players.filter((player) => player.connected);
    if (!connected.length) {
      room.status = "paused";
      this.clearTimer(room);
      this.emit({ type: "state", room: publicRoom(room) });
      return;
    }
    const starterIndex = game.questionIndex % connected.length;
    game.phase = "question";
    game.activePlayerId = connected[starterIndex]!.id;
    game.currentQuestionId = questionId;
    game.attemptedPlayerIds = [];
    game.eventSequence += 1;
    this.setDeadline(room, this.questionMs);
    room.updatedAt = this.timestamp();
    const visible = publicRoom(room);
    this.emit({ type: "state", room: visible });
    this.emit({ type: "question", room: visible, question: this.toPublicQuestion(this.getQuestion(questionId)) });
  }

  private beginReveal(room: InternalRoom, correct: boolean, playerId: string | null) {
    const game = this.requireGame(room);
    const question = this.getQuestion(game.currentQuestionId);
    this.clearTimer(room);
    game.phase = "reveal";
    game.activePlayerId = null;
    game.deadlineAt = new Date(this.now() + this.revealMs).toISOString();
    game.remainingMs = this.revealMs;
    game.eventSequence += 1;
    room.updatedAt = this.timestamp();
    const visible = publicRoom(room);
    this.emit({ type: "state", room: visible });
    this.emit({
      type: "reveal", room: visible, correct, playerId,
      correctAnswer: question.type === "mcq" ? question.options![question.correctIndex!]! : question.acceptedAnswers![0]!,
      fact: question.fact,
    });
    room.timer = setTimeout(() => {
      if (!room.game || room.game.phase !== "reveal") return;
      room.game.questionIndex += 1;
      this.beginQuestion(room);
    }, this.revealMs);
    room.timer.unref?.();
  }

  private finishGame(room: InternalRoom) {
    const game = this.requireGame(room);
    this.clearTimer(room);
    room.status = "finished";
    game.phase = "finished";
    game.activePlayerId = null;
    game.currentQuestionId = null;
    game.deadlineAt = null;
    game.remainingMs = 0;
    game.eventSequence += 1;
    room.updatedAt = this.timestamp();
    const visible = publicRoom(room);
    this.emit({ type: "state", room: visible });
    this.emit({ type: "finished", room: visible });
  }

  private advanceTurnOrReveal(room: InternalRoom) {
    const game = this.requireGame(room);
    const next = room.players.find((player) => player.connected && !game.attemptedPlayerIds.includes(player.id));
    if (!next) return this.beginReveal(room, false, null);
    game.activePlayerId = next.id;
    game.phase = "steal";
    game.eventSequence += 1;
    this.setDeadline(room, this.stealMs);
    room.updatedAt = this.timestamp();
    this.emit({ type: "state", room: publicRoom(room) });
  }

  private setDeadline(room: InternalRoom, duration: number) {
    this.clearTimer(room);
    const game = this.requireGame(room);
    game.remainingMs = duration;
    game.deadlineAt = new Date(this.now() + duration).toISOString();
    room.timer = setTimeout(() => {
      if (!room.game || (room.game.phase !== "question" && room.game.phase !== "steal")) return;
      const active = room.game.activePlayerId;
      if (active && !room.game.attemptedPlayerIds.includes(active)) room.game.attemptedPlayerIds.push(active);
      this.advanceTurnOrReveal(room);
    }, duration);
    room.timer.unref?.();
  }

  private emit(event: EngineEvent) { this.onEvent?.(event); }
  private clearTimer(room: InternalRoom) { if (room.timer) clearTimeout(room.timer); room.timer = undefined; }
  private timestamp() { return new Date(this.now()).toISOString(); }
  private requireRoom(code: string) { const room = this.rooms.get(code); if (!room) throw new GameError("ROOM_NOT_FOUND", "La sala no existe"); return room; }
  private requireMember(code: string, playerId: string) { const room = this.requireRoom(code); if (!room.players.some((player) => player.id === playerId)) throw new GameError("UNAUTHORIZED", "No perteneces a esta sala"); return room; }
  private requireGame(room: InternalRoom) { if (!room.game) throw new GameError("INVALID_PHASE", "La partida no ha comenzado"); return room.game; }
  private getQuestion(id: string | null) { const question = this.questionBank.find((item) => item.id === id); if (!question) throw new GameError("QUESTION_NOT_FOUND", "Pregunta no disponible"); return question; }
  private toPublicQuestion(question: Question): PublicQuestion { return { id: question.id, category: question.category, prompt: question.prompt, type: question.type, options: question.options }; }
  private isCorrect(question: Question, answer: string | number) { return question.type === "mcq" ? answer === question.correctIndex : question.acceptedAnswers!.some((accepted) => normalize(accepted) === normalize(String(answer))); }
}
