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
});
