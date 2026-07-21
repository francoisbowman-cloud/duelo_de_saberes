import { describe, expect, it } from "vitest";
import { displayNameSchema } from "@duelo/shared";
import { GameEngine, GameError } from "../src/game-engine.js";
import { questions } from "../src/questions.js";

function roomWithPlayers(count = 2) {
  const engine = new GameEngine(() => Date.now(), 60_000, 60_000, 10, questions.slice(0, 2));
  const creator = engine.createRoom("Ana", "socket-1");
  const sessions = [creator];
  for (let index = 2; index <= count; index++) sessions.push(engine.joinRoom(creator.room.code, `Jugador ${index}`, `socket-${index}`));
  return { engine, sessions, code: creator.room.code };
}

function correctAnswer(engine: GameEngine, code: string) {
  const question = engine.getPublicQuestion(code);
  return question.type === "mcq" ? question.options!.indexOf("Santo Domingo") : "Marte";
}

describe("GameEngine", () => {
  it("crea una sala con código impredecible y sesión persistente", () => {
    const { sessions } = roomWithPlayers(1);
    expect(sessions[0].room.code).toMatch(/^[A-Z0-9]{6}$/);
    expect(sessions[0].sessionToken.length).toBeGreaterThanOrEqual(32);
    expect(sessions[0].room.players[0].displayName).toBe("Ana");
  });

  it("permite unirse y rechaza al quinto jugador", () => {
    const { engine, code } = roomWithPlayers(4);
    expect(engine.getRoom(code).players).toHaveLength(4);
    expect(() => engine.joinRoom(code, "Quinto", "socket-5")).toThrowError(expect.objectContaining({ code: "ROOM_FULL" }));
  });

  it("rechaza salas inexistentes", () => {
    const engine = new GameEngine();
    expect(() => engine.joinRoom("ABC123", "Ana", "socket")).toThrowError(expect.objectContaining({ code: "ROOM_NOT_FOUND" }));
  });

  it("reconecta con token válido y rechaza un token inválido", () => {
    const { engine, sessions, code } = roomWithPlayers(1);
    engine.disconnect("socket-1");
    const restored = engine.rejoinRoom(code, sessions[0].sessionToken, "socket-new");
    expect(restored.room.players[0].connected).toBe(true);
    expect(() => engine.rejoinRoom(code, "x".repeat(32), "intruder")).toThrowError(expect.objectContaining({ code: "INVALID_SESSION" }));
  });

  it("impide responder fuera de turno", () => {
    const { engine, sessions, code } = roomWithPlayers();
    const room = engine.startGame(code, sessions[0].playerId);
    expect(() => engine.submitAnswer(code, sessions[1].playerId, 1, room.game!.eventSequence)).toThrowError(expect.objectContaining({ code: "NOT_YOUR_TURN" }));
  });

  it("valida la respuesta y calcula el punto en el servidor", () => {
    const { engine, sessions, code } = roomWithPlayers();
    const room = engine.startGame(code, sessions[0].playerId);
    const outcome = engine.submitAnswer(code, sessions[0].playerId, correctAnswer(engine, code), room.game!.eventSequence);
    expect(outcome.correct).toBe(true);
    expect(outcome.room.players[0].score).toBe(1);
    expect(outcome.room.game?.phase).toBe("reveal");
  });

  it("activa el robo y evita que quien falló vuelva a responder", () => {
    const { engine, sessions, code } = roomWithPlayers();
    const room = engine.startGame(code, sessions[0].playerId);
    const outcome = engine.submitAnswer(code, sessions[0].playerId, 0, room.game!.eventSequence);
    expect(outcome.room.game?.phase).toBe("steal");
    expect(outcome.room.game?.activePlayerId).toBe(sessions[1].playerId);
    expect(outcome.room.game?.attemptedPlayerIds).toContain(sessions[0].playerId);
  });

  it("mantiene la partida cuando se desconecta el creador", () => {
    const { engine, sessions, code } = roomWithPlayers();
    engine.startGame(code, sessions[0].playerId);
    const room = engine.disconnect("socket-1");
    expect(room?.status).toBe("playing");
    expect(room?.players[0].connected).toBe(false);
    expect(room?.players[1].connected).toBe(true);
  });

  it("avanza preguntas y finaliza la partida", async () => {
    const engine = new GameEngine(() => Date.now(), 60_000, 60_000, 5, questions.slice(0, 2));
    const session = engine.createRoom("Ana", "socket-1");
    let room = engine.startGame(session.room.code, session.playerId);
    engine.submitAnswer(session.room.code, session.playerId, correctAnswer(engine, session.room.code), room.game!.eventSequence);
    await new Promise((resolve) => setTimeout(resolve, 12));
    room = engine.getRoom(session.room.code);
    expect(room.game?.questionIndex).toBe(1);
    engine.submitAnswer(session.room.code, session.playerId, correctAnswer(engine, session.room.code), room.game!.eventSequence);
    await new Promise((resolve) => setTimeout(resolve, 12));
    room = engine.getRoom(session.room.code);
    expect(room.status).toBe("finished");
    expect(room.game?.phase).toBe("finished");
    expect(room.players[0].score).toBe(2);
  });

  it("sanitiza nombres antes de crear una sesión", () => {
    expect(displayNameSchema.parse("  <Ana>   María  ")).toBe("Ana María");
    expect(() => displayNameSchema.parse("<>")).toThrow();
  });

  it("mantiene la sala al seleccionar, jugar y abandonar Acertijos", () => {
    const { engine, sessions, code } = roomWithPlayers();
    engine.proposeGame(code, sessions[0].playerId, "riddles");
    engine.setReady(code, sessions[0].playerId, true);
    engine.setReady(code, sessions[1].playerId, true);
    const playing = engine.startSelectedGame(code, sessions[0].playerId);
    expect(playing.selectedGameId).toBe("riddles");
    expect(playing.riddleGame?.phase).toBe("solving");
    const lobby = engine.returnToLobby(code, sessions[1].playerId);
    expect(lobby.status).toBe("lobby");
    expect(lobby.players).toHaveLength(2);
    expect(lobby.riddleGame).toBeNull();
  });

  it("protege la solución y sincroniza pistas y respuestas", () => {
    const { engine, sessions, code } = roomWithPlayers();
    engine.proposeGame(code, sessions[0].playerId, "riddles");
    sessions.forEach((session) => engine.setReady(code, session.playerId, true));
    let room = engine.startSelectedGame(code, sessions[0].playerId);
    expect(room.riddleGame?.solution).toBeUndefined();
    engine.requestRiddleHint(code, sessions[1].playerId, room.riddleGame!.eventSequence);
    room = engine.getRoom(code);
    expect(room.riddleGame?.hints).toHaveLength(1);
    const outcome = engine.submitRiddleAnswer(code, sessions[0].playerId, "respuesta imposible", room.riddleGame!.eventSequence);
    expect(outcome.correct).toBe(false);
    expect(outcome.room.riddleGame?.attempts).toHaveLength(1);
    expect(outcome.room.riddleGame?.score).toBe(7);
  });

  it("vuelve a mezclar las preguntas al iniciar otra partida", () => {
    const { engine, sessions, code } = roomWithPlayers();
    engine.startGame(code, sessions[0].playerId);
    const firstQuestion = engine.getPublicQuestion(code).id;
    engine.returnToLobby(code, sessions[0].playerId);
    engine.proposeGame(code, sessions[0].playerId, "trivia");
    sessions.forEach((session) => engine.setReady(code, session.playerId, true));
    engine.startSelectedGame(code, sessions[0].playerId);
    expect(engine.getPublicQuestion(code).id).not.toBe(firstQuestion);
  });

  it("mantiene privadas las palabras y completa la deducción para dos jugadores", () => {
    const { engine, sessions, code } = roomWithPlayers();
    engine.proposeGame(code, sessions[0].playerId, "word-infiltrator");
    sessions.forEach((session) => engine.setReady(code, session.playerId, true));
    let room = engine.startSelectedGame(code, sessions[0].playerId);
    const privateA = engine.getWordPrivateState(code, sessions[0].playerId);
    const privateB = engine.getWordPrivateState(code, sessions[1].playerId);
    expect(JSON.stringify(room)).not.toContain(privateA.word);
    expect(JSON.stringify(room)).not.toContain(privateB.word);
    const first = room.wordGame!.activePlayerId!;
    const second = sessions.find((session) => session.playerId !== first)!.playerId;
    engine.submitWordClue(code, first, "pista inicial", room.wordGame!.eventSequence);
    room = engine.getRoom(code);
    engine.submitWordClue(code, second, "otra pista", room.wordGame!.eventSequence);
    room = engine.getRoom(code);
    expect(room.wordGame?.phase).toBe("voting");
    const relation = privateA.word === privateB.word ? "same" : "different";
    engine.submitWordVote(code, sessions[0].playerId, relation, room.wordGame!.eventSequence);
    room = engine.getRoom(code);
    engine.submitWordVote(code, sessions[1].playerId, relation, room.wordGame!.eventSequence);
    room = engine.getRoom(code);
    engine.submitWordGuess(code, sessions[0].playerId, privateB.word, room.wordGame!.eventSequence);
    room = engine.getRoom(code);
    engine.submitWordGuess(code, sessions[1].playerId, privateA.word, room.wordGame!.eventSequence);
    room = engine.getRoom(code);
    expect(room.wordGame?.phase).toBe("reveal");
    expect(room.wordGame?.scores[sessions[0].playerId]).toBe(5);
  });

  it("concede un solo bloqueo de pieza y lo libera al desconectarse", () => {
    const { engine, sessions, code } = roomWithPlayers();
    engine.proposeGame(code, sessions[0].playerId, "shared-puzzle"); sessions.forEach((session) => engine.setReady(code, session.playerId, true));
    const room = engine.startSelectedGame(code, sessions[0].playerId); const pieceId = Object.keys(room.puzzleGame!.pieces)[0]!;
    expect(engine.requestPuzzleLock(code, sessions[0].playerId, pieceId)).toBe(true);
    expect(engine.requestPuzzleLock(code, sessions[1].playerId, pieceId)).toBe(false);
    engine.disconnect("socket-1");
    expect(engine.getRoom(code).puzzleGame?.pieces[pieceId]?.controlledByPlayerId).toBeNull();
  });

  it("valida el encaje y finaliza el rompecabezas en el servidor", () => {
    const { engine, sessions, code } = roomWithPlayers();
    engine.proposeGame(code, sessions[0].playerId, "shared-puzzle"); sessions.forEach((session) => engine.setReady(code, session.playerId, true));
    let room = engine.startSelectedGame(code, sessions[0].playerId);
    for (const piece of Object.values(room.puzzleGame!.pieces)) { engine.requestPuzzleLock(code, sessions[0].playerId, piece.id); expect(engine.releasePuzzlePiece(code, sessions[0].playerId, piece.id, piece.correctSlot)).toBe(true); }
    room = engine.getRoom(code); expect(room.puzzleGame?.phase).toBe("finished"); expect(room.status).toBe("results"); expect(room.puzzleGame?.completedPieceIds).toHaveLength(9);
  });

  it("publica el estado de audio sin almacenar contenido", () => {
    const { engine, sessions, code } = roomWithPlayers();
    let room = engine.updateAudioStatus(code, sessions[0].playerId, true, false);
    expect(room.players[0].audioEnabled).toBe(true); expect(room.players[0].audioMuted).toBe(false);
    room = engine.updateAudioStatus(code, sessions[0].playerId, true, true);
    expect(room.players[0].audioMuted).toBe(true);
  });

  it("permite salir de la sala y elimina al jugador del roster", () => {
    const { engine, sessions, code } = roomWithPlayers();
    const room = engine.leaveRoom(code, sessions[0].playerId);
    expect(room?.players).toHaveLength(1); expect(room?.players[0].id).toBe(sessions[1].playerId); expect(room?.players[0].position).toBe(1);
    expect(() => engine.rejoinRoom(code, sessions[0].sessionToken, "socket-new")).toThrowError(expect.objectContaining({ code: "INVALID_SESSION" }));
  });

  it("configura rompecabezas de 3x3, 4x4 y 5x5", () => {
    const { engine, sessions, code } = roomWithPlayers();
    for (const [difficulty, pieces] of [["easy", 9], ["medium", 16], ["hard", 25]] as const) {
      engine.configureGame(code, sessions[0].playerId, { difficulty }); engine.proposeGame(code, sessions[0].playerId, "shared-puzzle"); sessions.forEach((s) => engine.setReady(code, s.playerId, true));
      expect(Object.keys(engine.startSelectedGame(code, sessions[0].playerId).puzzleGame!.pieces)).toHaveLength(pieces); engine.returnToLobby(code, sessions[0].playerId);
    }
  });

  it("configura la cantidad de personas y exige que estén presentes", () => {
    const { engine, sessions, code } = roomWithPlayers(); engine.configureGame(code, sessions[0].playerId, { desiredPlayers: 3 }); engine.proposeGame(code, sessions[0].playerId, "trivia"); sessions.forEach((s) => engine.setReady(code, s.playerId, true));
    expect(engine.getRoom(code).gameConfig.desiredPlayers).toBe(3); expect(() => engine.startSelectedGame(code, sessions[0].playerId)).toThrowError(expect.objectContaining({ code: "PLAYER_COUNT_MISMATCH" }));
  });

  it("permite Palabra infiltrada con tres personas", () => {
    const { engine, sessions, code } = roomWithPlayers(3); engine.configureGame(code, sessions[0].playerId, { desiredPlayers: 3 }); engine.proposeGame(code, sessions[0].playerId, "word-infiltrator"); sessions.forEach((s) => engine.setReady(code, s.playerId, true));
    const room = engine.startSelectedGame(code, sessions[0].playerId); expect(room.wordGame?.phase).toBe("clue_round"); expect(sessions.map((s) => engine.getWordPrivateState(code, s.playerId).word)).toHaveLength(3);
  });

  it("sincroniza turnos de Historia compartida", () => {
    const { engine, sessions, code } = roomWithPlayers(); engine.proposeGame(code, sessions[0].playerId, "shared-story"); sessions.forEach((s) => engine.setReady(code, s.playerId, true));
    let room = engine.startSelectedGame(code, sessions[0].playerId); const turn = room.storyGame!.turnPlayerId; engine.addStoryEntry(code, turn, "Entonces apareció una carta bajo la puerta."); room = engine.getRoom(code);
    expect(room.storyGame?.entries).toHaveLength(2); expect(room.storyGame?.turnPlayerId).not.toBe(turn);
  });

  it("mueve el laberinto en el servidor y conserva el progreso", () => {
    const { engine, sessions, code } = roomWithPlayers(); engine.proposeGame(code, sessions[0].playerId, "maze"); sessions.forEach((s) => engine.setReady(code, s.playerId, true)); engine.startSelectedGame(code, sessions[0].playerId);
    engine.moveMaze(code, sessions[1].playerId, "right"); expect(engine.getRoom(code).mazeGame).toMatchObject({ player: { row: 0, column: 1 }, moves: 1 });
  });

  it("avanza y registra un caso de detectives por niveles", () => {
    const { engine, sessions, code } = roomWithPlayers(); engine.proposeGame(code, sessions[0].playerId, "detectives"); sessions.forEach((s) => engine.setReady(code, s.playerId, true)); let room = engine.startSelectedGame(code, sessions[0].playerId);
    engine.detectiveAction(code, sessions[1].playerId, room.detectiveGame!.availableActions[0]!.id); room = engine.getRoom(code);
    expect(room.detectiveGame?.level).toBe(2); expect(room.detectiveGame?.clues).toHaveLength(1); expect(room.detectiveGame?.journal.length).toBeGreaterThan(1);
  });
});
