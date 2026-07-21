import { randomBytes, randomUUID } from "node:crypto";
import type { GameState, PlayerState, PublicQuestion, PuzzlePublicState, RiddlePublicState, RoomState, WordGamePrivateState, WordGamePublicState } from "@duelo/shared";
import { questions, type Question } from "./questions.js";
import { riddles, type Riddle } from "./riddles.js";
import { wordPairs } from "./word-pairs.js";

type InternalPlayer = PlayerState & { sessionToken: string; socketId: string | null };
type InternalRoom = Omit<RoomState, "players"> & {
  players: InternalPlayer[];
  questionOrder: string[];
  riddleOrder: string[];
  wordPairOrder: number[];
  wordAssignments: Record<string, string>;
  wordMeta: { category: string; difficulty: "easy" | "medium" | "hard" } | null;
  wordVotes: Record<string, "same" | "different">;
  wordGuesses: Record<string, string>;
  puzzleLockTimers: Record<string, NodeJS.Timeout>;
  timer?: NodeJS.Timeout;
};

export type EngineEvent =
  | { type: "state"; room: RoomState }
  | { type: "question"; room: RoomState; question: PublicQuestion }
  | { type: "reveal"; room: RoomState; correct: boolean; playerId: string | null; correctAnswer: string; fact: string }
  | { type: "riddle"; room: RoomState; state: RiddlePublicState }
  | { type: "word"; room: RoomState; state: WordGamePublicState }
  | { type: "puzzle"; room: RoomState; state: PuzzlePublicState }
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
const reshuffled = <T>(items: T[], previousFirst?: T) => {
  const copy = shuffled(items);
  if (copy.length > 1 && previousFirst !== undefined && copy[0] === previousFirst) {
    [copy[0], copy[1]] = [copy[1]!, copy[0]!];
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
  selectedGameId: room.selectedGameId,
  proposedByPlayerId: room.proposedByPlayerId,
  readyPlayerIds: room.readyPlayerIds,
  game: room.game,
  riddleGame: room.riddleGame,
  wordGame: room.wordGame,
  puzzleGame: room.puzzleGame,
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
      maxPlayers: 4, players: [], selectedGameId: null, proposedByPlayerId: null, readyPlayerIds: [],
      game: null, riddleGame: null, wordGame: null, puzzleGame: null, questionOrder: shuffled(this.questionBank.map((question) => question.id)),
      riddleOrder: shuffled(riddles.map((riddle) => riddle.id)),
      wordPairOrder: shuffled(wordPairs.map((_, index) => index)), wordAssignments: {}, wordMeta: null, wordVotes: {}, wordGuesses: {}, puzzleLockTimers: {},
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
    if (room.selectedGameId === "riddles") return this.startRiddles(room);
    if (room.selectedGameId === "word-infiltrator") return this.startWordGame(room);
    if (room.selectedGameId === "shared-puzzle") return this.startPuzzle(room);
    room.selectedGameId = "trivia";
    room.questionOrder = reshuffled(this.questionBank.map((question) => question.id), room.questionOrder[0]);
    room.status = "playing";
    room.game = {
      questionIndex: 0, round: 1, phase: "question", activePlayerId: null,
      currentQuestionId: null, attemptedPlayerIds: [], deadlineAt: null,
      remainingMs: this.questionMs, eventSequence: 0,
    };
    this.beginQuestion(room);
    return publicRoom(room);
  }

  proposeGame(code: string, playerId: string, gameId: "trivia" | "riddles" | "word-infiltrator" | "shared-puzzle") {
    const room = this.requireMember(code, playerId);
    if (room.status !== "lobby") throw new GameError("INVALID_PHASE", "Regresa al lobby antes de elegir otro juego");
    room.selectedGameId = gameId;
    room.proposedByPlayerId = playerId;
    room.readyPlayerIds = [];
    room.updatedAt = this.timestamp();
    const visible = publicRoom(room); this.emit({ type: "state", room: visible }); return visible;
  }

  setReady(code: string, playerId: string, ready: boolean) {
    const room = this.requireMember(code, playerId);
    if (room.status !== "lobby" || !room.selectedGameId) throw new GameError("INVALID_PHASE", "Selecciona un juego primero");
    room.readyPlayerIds = ready ? [...new Set([...room.readyPlayerIds, playerId])] : room.readyPlayerIds.filter((id) => id !== playerId);
    room.updatedAt = this.timestamp();
    const visible = publicRoom(room); this.emit({ type: "state", room: visible }); return visible;
  }

  startSelectedGame(code: string, playerId: string) {
    const room = this.requireMember(code, playerId);
    const connectedIds = room.players.filter((p) => p.connected).map((p) => p.id);
    if (connectedIds.length < 2) throw new GameError("NOT_ENOUGH_PLAYERS", "Se necesitan al menos dos jugadores");
    if (!room.selectedGameId) throw new GameError("GAME_NOT_SELECTED", "Selecciona un juego");
    if (!connectedIds.every((id) => room.readyPlayerIds.includes(id))) throw new GameError("PLAYERS_NOT_READY", "Todos deben indicar que están listos");
    return this.startGame(code, playerId);
  }

  requestRiddleHint(code: string, playerId: string, eventSequence: number) {
    const room = this.requireMember(code, playerId); const state = this.requireRiddle(room);
    if (state.phase !== "solving" || state.eventSequence !== eventSequence) throw new GameError("STALE_EVENT", "El acertijo ya cambió");
    const riddle = this.currentRiddle(room); if (state.hints.length >= riddle.hints.length) throw new GameError("NO_MORE_HINTS", "No quedan más pistas");
    state.hints.push(riddle.hints[state.hints.length]!); state.score = Math.max(0, state.score - 2); state.eventSequence += 1;
    room.updatedAt = this.timestamp(); this.emitRiddle(room); return publicRoom(room);
  }

  submitRiddleAnswer(code: string, playerId: string, answer: string, eventSequence: number) {
    const room = this.requireMember(code, playerId); const state = this.requireRiddle(room);
    if (state.phase !== "solving" || state.eventSequence !== eventSequence) throw new GameError("STALE_EVENT", "El acertijo ya cambió");
    const riddle = this.currentRiddle(room); const correct = riddle.answers.some((candidate) => normalize(candidate) === normalize(answer));
    state.attempts.push({ playerId, answer, correct }); state.eventSequence += 1;
    if (!correct) { state.score = Math.max(0, state.score - 1); this.emitRiddle(room); return { correct: false, room: publicRoom(room) }; }
    this.clearTimer(room); state.phase = "revealing"; state.solution = riddle.answers[0]; state.explanation = riddle.explanation; state.deadlineAt = new Date(this.now() + this.revealMs).toISOString();
    this.emitRiddle(room); room.timer = setTimeout(() => this.advanceRiddle(room), this.revealMs); room.timer.unref?.();
    return { correct: true, room: publicRoom(room) };
  }

  submitWordClue(code: string, playerId: string, clue: string, eventSequence: number) {
    const room = this.requireMember(code, playerId); const state = this.requireWordGame(room);
    if (state.phase !== "clue_round" || state.eventSequence !== eventSequence) throw new GameError("STALE_EVENT", "La ronda ya cambió");
    if (state.activePlayerId !== playerId) throw new GameError("NOT_YOUR_TURN", "Espera la pista de la otra persona");
    const ownWord = room.wordAssignments[playerId]!;
    if (normalize(clue).includes(normalize(ownWord)) || normalize(ownWord).includes(normalize(clue))) throw new GameError("WORD_EXPOSED", "La pista no puede contener tu palabra");
    state.clues.push({ playerId, clue }); state.eventSequence += 1;
    const next = room.players.find((player) => player.connected && !state.clues.some((item) => item.playerId === player.id));
    if (next) state.activePlayerId = next.id; else { state.phase = "voting"; state.activePlayerId = null; }
    room.updatedAt = this.timestamp(); this.emitWord(room); return publicRoom(room);
  }

  submitWordVote(code: string, playerId: string, vote: "same" | "different", eventSequence: number) {
    const room = this.requireMember(code, playerId); const state = this.requireWordGame(room);
    if (state.phase !== "voting" || state.eventSequence !== eventSequence) throw new GameError("STALE_EVENT", "La votación ya cambió");
    if (room.wordVotes[playerId]) throw new GameError("DUPLICATE_VOTE", "Ya votaste");
    room.wordVotes[playerId] = vote; state.submittedVotePlayerIds.push(playerId); state.eventSequence += 1;
    if (state.submittedVotePlayerIds.length === room.players.filter((p) => p.connected).length) state.phase = "guessing";
    room.updatedAt = this.timestamp(); this.emitWord(room); return publicRoom(room);
  }

  submitWordGuess(code: string, playerId: string, guess: string, eventSequence: number) {
    const room = this.requireMember(code, playerId); const state = this.requireWordGame(room);
    if (state.phase !== "guessing" || state.eventSequence !== eventSequence) throw new GameError("STALE_EVENT", "La ronda ya cambió");
    if (room.wordGuesses[playerId]) throw new GameError("DUPLICATE_GUESS", "Ya enviaste tu adivinanza");
    room.wordGuesses[playerId] = guess; state.submittedGuessPlayerIds.push(playerId); state.eventSequence += 1;
    if (state.submittedGuessPlayerIds.length === room.players.filter((p) => p.connected).length) this.revealWordGame(room);
    else this.emitWord(room);
    return publicRoom(room);
  }

  getWordPrivateState(code: string, playerId: string): WordGamePrivateState {
    const room = this.requireMember(code, playerId); const word = room.wordAssignments[playerId];
    if (!word || !room.wordMeta) throw new GameError("INVALID_PHASE", "No hay palabra asignada");
    return { word, ...room.wordMeta };
  }

  requestPuzzleLock(code: string, playerId: string, pieceId: string) {
    const room = this.requireMember(code, playerId); const state = this.requirePuzzle(room); const piece = state.pieces[pieceId];
    if (!piece || piece.isPlaced) throw new GameError("PIECE_UNAVAILABLE", "La pieza ya no está disponible");
    if (piece.controlledByPlayerId && piece.controlledByPlayerId !== playerId) return false;
    piece.controlledByPlayerId = playerId; this.renewPuzzleLock(room, pieceId, playerId); this.emitPuzzle(room); return true;
  }

  movePuzzlePiece(code: string, playerId: string, pieceId: string, x: number, y: number) {
    const room = this.requireMember(code, playerId); const state = this.requirePuzzle(room); const piece = state.pieces[pieceId];
    if (!piece || piece.isPlaced || piece.controlledByPlayerId !== playerId) return false;
    piece.currentX = x; piece.currentY = y; this.renewPuzzleLock(room, pieceId, playerId); this.emitPuzzle(room); return true;
  }

  releasePuzzlePiece(code: string, playerId: string, pieceId: string, targetSlot: number | null) {
    const room = this.requireMember(code, playerId); const state = this.requirePuzzle(room); const piece = state.pieces[pieceId];
    if (!piece || piece.controlledByPlayerId !== playerId) throw new GameError("LOCK_REQUIRED", "No controlas esta pieza");
    const placed = targetSlot === piece.correctSlot;
    if (placed) { piece.isPlaced = true; piece.currentX = (piece.correctSlot % state.columns) / state.columns; piece.currentY = Math.floor(piece.correctSlot / state.columns) / state.rows; state.completedPieceIds.push(piece.id); }
    piece.controlledByPlayerId = null; this.clearPuzzleLock(room, pieceId);
    if (state.completedPieceIds.length === Object.keys(state.pieces).length) { state.phase = "finished"; state.finishedAt = this.now(); room.status = "results"; }
    room.updatedAt = this.timestamp(); this.emitPuzzle(room); if (state.phase === "finished") this.emit({ type: "finished", room: publicRoom(room) }); return placed;
  }

  returnToLobby(code: string, playerId: string) {
    const room = this.requireMember(code, playerId); this.clearTimer(room);
    room.status = "lobby"; room.game = null; room.riddleGame = null; room.wordGame = null; room.puzzleGame = null; room.selectedGameId = null; room.proposedByPlayerId = null; room.readyPlayerIds = [];
    Object.keys(room.puzzleLockTimers).forEach((id) => this.clearPuzzleLock(room, id));
    room.wordAssignments = {}; room.wordMeta = null; room.wordVotes = {}; room.wordGuesses = {};
    room.players.forEach((player) => { player.score = 0; player.streak = 0; }); room.updatedAt = this.timestamp();
    const visible = publicRoom(room); this.emit({ type: "state", room: visible }); return visible;
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
      player.audioEnabled = false;
      player.audioMuted = false;
      player.socketId = null;
      player.disconnectedAt = this.timestamp();
      room.updatedAt = player.disconnectedAt;
      const game = room.game;
      if (game && room.status === "playing" && game.activePlayerId === player.id && (game.phase === "question" || game.phase === "steal")) {
        if (!game.attemptedPlayerIds.includes(player.id)) game.attemptedPlayerIds.push(player.id);
        this.advanceTurnOrReveal(room);
      }
      if (room.puzzleGame) for (const piece of Object.values(room.puzzleGame.pieces)) if (piece.controlledByPlayerId === player.id) { piece.controlledByPlayerId = null; this.clearPuzzleLock(room, piece.id); }
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

  getRiddleState(code: string) { return this.requireRiddle(this.requireRoom(code)); }

  private addPlayer(room: InternalRoom, displayName: string, socketId: string) {
    const timestamp = this.timestamp();
    const player: InternalPlayer = {
      id: randomUUID(), sessionToken: randomBytes(32).toString("base64url"), socketId,
      displayName, connected: true, score: 0, streak: 0, position: room.players.length + 1,
      joinedAt: timestamp, disconnectedAt: null, audioEnabled: false, audioMuted: false,
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

  updateAudioStatus(code: string, playerId: string, enabled: boolean, muted: boolean) {
    const room = this.requireMember(code, playerId); const player = room.players.find((item) => item.id === playerId)!;
    player.audioEnabled = enabled; player.audioMuted = enabled ? muted : false; room.updatedAt = this.timestamp();
    const visible = publicRoom(room); this.emit({ type: "state", room: visible }); return visible;
  }

  leaveRoom(code: string, playerId: string) {
    const room = this.requireMember(code, playerId); const leaving = room.players.find((player) => player.id === playerId)!;
    if (room.puzzleGame) for (const piece of Object.values(room.puzzleGame.pieces)) if (piece.controlledByPlayerId === playerId) { piece.controlledByPlayerId = null; this.clearPuzzleLock(room, piece.id); }
    room.players = room.players.filter((player) => player.id !== playerId); room.players.forEach((player, index) => { player.position = index + 1; });
    if (!room.players.length) { this.clearTimer(room); Object.keys(room.puzzleLockTimers).forEach((id) => this.clearPuzzleLock(room, id)); this.rooms.delete(code); return null; }
    if (room.game && room.game.activePlayerId === leaving.id) { if (!room.game.attemptedPlayerIds.includes(leaving.id)) room.game.attemptedPlayerIds.push(leaving.id); this.advanceTurnOrReveal(room); }
    if (room.status === "playing" && room.players.filter((player) => player.connected).length < 2) room.status = "paused";
    room.updatedAt = this.timestamp(); const visible = publicRoom(room); this.emit({ type: "state", room: visible }); return visible;
  }

  private startRiddles(room: InternalRoom) {
    room.status = "playing"; room.game = null;
    room.riddleOrder = reshuffled(riddles.map((riddle) => riddle.id), room.riddleOrder[0]);
    const riddle = this.getRiddle(room.riddleOrder[0]!);
    room.riddleGame = { phase: "solving", roundIndex: 0, totalRounds: 3, prompt: riddle.prompt, difficulty: riddle.difficulty, hints: [], score: 10, remainingMs: 90_000, deadlineAt: null, eventSequence: 1, attempts: [] };
    this.setRiddleDeadline(room); room.updatedAt = this.timestamp(); this.emitRiddle(room); return publicRoom(room);
  }

  private startWordGame(room: InternalRoom) {
    const connected = room.players.filter((player) => player.connected);
    if (connected.length !== 2) throw new GameError("WORD_GAME_REQUIRES_TWO", "Esta primera versión de Palabra infiltrada requiere exactamente dos jugadores");
    room.wordPairOrder = reshuffled(wordPairs.map((_, index) => index), room.wordPairOrder[0]);
    const pair = wordPairs[room.wordPairOrder[0]!]!; const same = Math.random() < 0.35;
    room.wordAssignments = { [connected[0]!.id]: pair.first, [connected[1]!.id]: same ? pair.first : pair.second };
    room.wordMeta = { category: pair.category, difficulty: pair.difficulty }; room.wordVotes = {}; room.wordGuesses = {};
    room.game = null; room.riddleGame = null; room.status = "playing";
    room.wordGame = { phase: "clue_round", roundIndex: 0, activePlayerId: connected[Math.floor(Math.random() * 2)]!.id, clues: [], submittedVotePlayerIds: [], submittedGuessPlayerIds: [], scores: Object.fromEntries(connected.map((p) => [p.id, 0])), eventSequence: 1 };
    room.updatedAt = this.timestamp(); this.emitWord(room); return publicRoom(room);
  }

  private startPuzzle(room: InternalRoom) {
    const rows = 3, columns = 3; const imageIds = ["abstract", "landscape", "illustration"] as const; const imageId = imageIds[Math.floor(Math.random() * imageIds.length)]!;
    const pieces = Object.fromEntries(shuffled(Array.from({ length: rows * columns }, (_, index) => index)).map((correctSlot, trayIndex) => [`piece-${correctSlot}`, { id: `piece-${correctSlot}`, currentX: .05 + (trayIndex % columns) * .34, currentY: .7 + Math.floor(trayIndex / columns) * .14, correctSlot, isPlaced: false, controlledByPlayerId: null }]));
    room.game = null; room.riddleGame = null; room.wordGame = null; room.status = "playing"; room.puzzleGame = { phase: "playing", imageId, rows, columns, pieces, completedPieceIds: [], startedAt: this.now(), finishedAt: null };
    room.updatedAt = this.timestamp(); this.emitPuzzle(room); return publicRoom(room);
  }

  private emitPuzzle(room: InternalRoom) { const state = this.requirePuzzle(room); const visible = publicRoom(room); this.emit({ type: "state", room: visible }); this.emit({ type: "puzzle", room: visible, state }); }
  private renewPuzzleLock(room: InternalRoom, pieceId: string, playerId: string) { this.clearPuzzleLock(room, pieceId); room.puzzleLockTimers[pieceId] = setTimeout(() => { const piece = room.puzzleGame?.pieces[pieceId]; if (piece?.controlledByPlayerId === playerId) { piece.controlledByPlayerId = null; this.emitPuzzle(room); } delete room.puzzleLockTimers[pieceId]; }, 5_000); room.puzzleLockTimers[pieceId]!.unref?.(); }
  private clearPuzzleLock(room: InternalRoom, pieceId: string) { const timer = room.puzzleLockTimers[pieceId]; if (timer) clearTimeout(timer); delete room.puzzleLockTimers[pieceId]; }

  private revealWordGame(room: InternalRoom) {
    const state = this.requireWordGame(room); const players = room.players.filter((p) => p.connected);
    const relation: "same" | "different" = room.wordAssignments[players[0]!.id] === room.wordAssignments[players[1]!.id] ? "same" : "different";
    for (const player of players) {
      const other = players.find((candidate) => candidate.id !== player.id)!;
      if (room.wordVotes[player.id] === relation) state.scores[player.id] = (state.scores[player.id] ?? 0) + 2;
      if (normalize(room.wordGuesses[player.id] ?? "") === normalize(room.wordAssignments[other.id]!)) state.scores[player.id] = (state.scores[player.id] ?? 0) + 3;
    }
    state.phase = "reveal"; state.activePlayerId = null; state.relationType = relation; state.revealedWords = { ...room.wordAssignments }; state.eventSequence += 1;
    room.updatedAt = this.timestamp(); this.emitWord(room);
    room.timer = setTimeout(() => { if (!room.wordGame) return; room.wordGame.phase = "finished"; room.wordGame.eventSequence += 1; room.status = "results"; this.emitWord(room); this.emit({ type: "finished", room: publicRoom(room) }); }, this.revealMs); room.timer.unref?.();
  }

  private emitWord(room: InternalRoom) { const state = this.requireWordGame(room); const visible = publicRoom(room); this.emit({ type: "state", room: visible }); this.emit({ type: "word", room: visible, state }); }

  private advanceRiddle(room: InternalRoom) {
    const state = this.requireRiddle(room); this.clearTimer(room);
    if (state.roundIndex + 1 >= state.totalRounds) {
      state.phase = "finished"; state.deadlineAt = null; state.remainingMs = 0; state.eventSequence += 1; room.status = "results";
      room.updatedAt = this.timestamp(); this.emitRiddle(room); this.emit({ type: "finished", room: publicRoom(room) }); return;
    }
    state.roundIndex += 1; const riddle = this.currentRiddle(room); state.phase = "solving"; state.prompt = riddle.prompt; state.difficulty = riddle.difficulty;
    state.hints = []; state.attempts = []; state.solution = undefined; state.explanation = undefined; state.score += 10; state.eventSequence += 1;
    this.setRiddleDeadline(room); room.updatedAt = this.timestamp(); this.emitRiddle(room);
  }

  private setRiddleDeadline(room: InternalRoom) {
    const state = this.requireRiddle(room); this.clearTimer(room); state.remainingMs = 90_000; state.deadlineAt = new Date(this.now() + 90_000).toISOString();
    room.timer = setTimeout(() => { const current = this.requireRiddle(room); const riddle = this.currentRiddle(room); current.phase = "revealing"; current.solution = riddle.answers[0]; current.explanation = riddle.explanation; current.eventSequence += 1; this.emitRiddle(room); room.timer = setTimeout(() => this.advanceRiddle(room), this.revealMs); room.timer.unref?.(); }, 90_000);
    room.timer.unref?.();
  }

  private emitRiddle(room: InternalRoom) { const state = this.requireRiddle(room); const visible = publicRoom(room); this.emit({ type: "state", room: visible }); this.emit({ type: "riddle", room: visible, state }); }

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
  private requireRiddle(room: InternalRoom) { if (!room.riddleGame) throw new GameError("INVALID_PHASE", "No hay una partida de acertijos activa"); return room.riddleGame; }
  private requireWordGame(room: InternalRoom) { if (!room.wordGame) throw new GameError("INVALID_PHASE", "No hay una partida de Palabra infiltrada activa"); return room.wordGame; }
  private requirePuzzle(room: InternalRoom) { if (!room.puzzleGame) throw new GameError("INVALID_PHASE", "No hay un rompecabezas activo"); return room.puzzleGame; }
  private currentRiddle(room: InternalRoom) { return this.getRiddle(room.riddleOrder[this.requireRiddle(room).roundIndex]!); }
  private getRiddle(id: string) { const riddle = riddles.find((item) => item.id === id); if (!riddle) throw new GameError("RIDDLE_NOT_FOUND", "Acertijo no disponible"); return riddle; }
  private getQuestion(id: string | null) { const question = this.questionBank.find((item) => item.id === id); if (!question) throw new GameError("QUESTION_NOT_FOUND", "Pregunta no disponible"); return question; }
  private toPublicQuestion(question: Question): PublicQuestion { return { id: question.id, category: question.category, prompt: question.prompt, type: question.type, options: question.options }; }
  private isCorrect(question: Question, answer: string | number) { return question.type === "mcq" ? answer === question.correctIndex : question.acceptedAnswers!.some((accepted) => normalize(accepted) === normalize(String(answer))); }
}
