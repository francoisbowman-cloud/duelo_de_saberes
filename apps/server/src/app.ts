import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import staticPlugin from "@fastify/static";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { clientSchemas, type ClientToServerEvents, type RoomState, type ServerToClientEvents } from "@duelo/shared";
import { GameEngine, GameError } from "./game-engine.js";

const fail = (error: unknown) => ({
  ok: false,
  error: error instanceof GameError
    ? { code: error.code, message: error.message }
    : { code: "INTERNAL_ERROR", message: "Ocurrió un error inesperado" },
} as const);

export async function buildApp(options: { clientOrigin?: string; engine?: GameEngine } = {}) {
  const app = Fastify({ logger: process.env.NODE_ENV === "production", bodyLimit: 16_384 });
  const origins = (options.clientOrigin ?? process.env.CLIENT_ORIGIN ?? "http://localhost:8080,http://127.0.0.1:8080")
    .split(",").map((origin) => origin.trim());
  await app.register(cors, { origin: origins, credentials: true });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
  await app.register(staticPlugin, { root: fileURLToPath(new URL("../../web", import.meta.url)), index: "index.html" });
  app.get("/health", async () => ({ ok: true, service: "duelo-server", timestamp: new Date().toISOString() }));

  const io = new Server<ClientToServerEvents, ServerToClientEvents>(app.server, {
    cors: { origin: origins, credentials: true },
    maxHttpBufferSize: 16_384,
    pingTimeout: 20_000,
  });
  const engine = options.engine ?? new GameEngine();

  engine.setEventListener((event) => {
    if (event.type === "state") io.to(event.room.code).emit("room:state", event.room);
    if (event.type === "question") io.to(event.room.code).emit("game:question", event.question);
    if (event.type === "reveal") io.to(event.room.code).emit("game:reveal", {
      correct: event.correct, playerId: event.playerId,
      correctAnswer: event.correctAnswer, fact: event.fact,
    });
    if (event.type === "finished") io.to(event.room.code).emit("game:finished", event.room);
  });

  io.on("connection", (socket) => {
    let session: { code: string; playerId: string } | null = null;
    const enter = (result: { room: RoomState; playerId: string; sessionToken: string; replacedSocketId: string | null }) => {
      session = { code: result.room.code, playerId: result.playerId };
      socket.join(result.room.code);
      io.to(result.room.code).emit("room:state", result.room);
      return result;
    };

    socket.on("room:create", (raw, ack) => {
      const parsed = clientSchemas["room:create"].safeParse(raw);
      if (!parsed.success) return ack(fail(new GameError("INVALID_PAYLOAD", "Nombre inválido")));
      try { ack({ ok: true, data: enter(engine.createRoom(parsed.data.displayName, socket.id)) }); }
      catch (error) { ack(fail(error)); }
    });
    socket.on("room:join", (raw, ack) => {
      const parsed = clientSchemas["room:join"].safeParse(raw);
      if (!parsed.success) return ack(fail(new GameError("INVALID_PAYLOAD", "Datos de ingreso inválidos")));
      try { ack({ ok: true, data: enter(engine.joinRoom(parsed.data.code, parsed.data.displayName, socket.id)) }); }
      catch (error) { ack(fail(error)); }
    });
    socket.on("room:rejoin", (raw, ack) => {
      const parsed = clientSchemas["room:rejoin"].safeParse(raw);
      if (!parsed.success) return ack(fail(new GameError("INVALID_PAYLOAD", "Sesión inválida")));
      try {
        const result = engine.rejoinRoom(parsed.data.code, parsed.data.sessionToken, socket.id);
        if (result.replacedSocketId) io.to(result.replacedSocketId).emit("session:replaced");
        ack({ ok: true, data: enter(result) });
        if (result.room.game && result.room.status === "playing") socket.emit("game:question", engine.getPublicQuestion(result.room.code));
      } catch (error) { ack(fail(error)); }
    });
    socket.on("game:start", (raw, ack) => {
      const parsed = clientSchemas["game:start"].safeParse(raw);
      if (!parsed.success || !session) return ack(fail(new GameError("UNAUTHORIZED", "Sesión inválida")));
      try { ack({ ok: true, data: engine.startGame(parsed.data.code, session.playerId) }); }
      catch (error) { ack(fail(error)); }
    });
    socket.on("game:submit-answer", (raw, ack) => {
      const parsed = clientSchemas["game:submit-answer"].safeParse(raw);
      if (!parsed.success || !session) return ack(fail(new GameError("INVALID_PAYLOAD", "Respuesta inválida")));
      try {
        engine.submitAnswer(parsed.data.code, session.playerId, parsed.data.answer, parsed.data.eventSequence);
        ack({ ok: true, data: { accepted: true } });
      } catch (error) { ack(fail(error)); }
    });
    socket.on("ping", (raw, ack) => {
      const parsed = clientSchemas.ping.safeParse(raw);
      if (!parsed.success) return ack(fail(new GameError("INVALID_PAYLOAD", "Ping inválido")));
      ack({ ok: true, data: { sentAt: parsed.data.sentAt, serverAt: Date.now() } });
    });
    socket.on("disconnect", () => {
      const room = engine.disconnect(socket.id);
      if (room) io.to(room.code).emit("room:state", room);
    });
  });

  return { app, io, engine };
}
