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
  const playerSockets = new Map<string, string>();

  engine.setEventListener((event) => {
    if (event.type === "state") io.to(event.room.code).emit("room:state", event.room);
    if (event.type === "question") io.to(event.room.code).emit("game:question", event.question);
    if (event.type === "reveal") io.to(event.room.code).emit("game:reveal", {
      correct: event.correct, playerId: event.playerId,
      correctAnswer: event.correctAnswer, fact: event.fact,
    });
    if (event.type === "riddle") io.to(event.room.code).emit("riddle:state", event.state);
    if (event.type === "word") io.to(event.room.code).emit("word:state", event.state);
    if (event.type === "puzzle") io.to(event.room.code).emit("puzzle:state", event.state);
    if (event.type === "finished") io.to(event.room.code).emit("game:finished", event.room);
  });

  io.on("connection", (socket) => {
    let session: { code: string; playerId: string } | null = null;
    const enter = (result: { room: RoomState; playerId: string; sessionToken: string; replacedSocketId: string | null }) => {
      session = { code: result.room.code, playerId: result.playerId };
      playerSockets.set(result.playerId, socket.id);
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
        if (result.room.riddleGame && result.room.status === "playing") socket.emit("riddle:state", engine.getRiddleState(result.room.code));
        if (result.room.wordGame) {
          socket.emit("word:state", result.room.wordGame);
          socket.emit("word:private-state", engine.getWordPrivateState(result.room.code, result.playerId));
        }
        if (result.room.puzzleGame) socket.emit("puzzle:state", result.room.puzzleGame);
      } catch (error) { ack(fail(error)); }
    });
    socket.on("game:start", (raw, ack) => {
      const parsed = clientSchemas["game:start"].safeParse(raw);
      if (!parsed.success || !session) return ack(fail(new GameError("UNAUTHORIZED", "Sesión inválida")));
      try {
        const room = engine.startSelectedGame(parsed.data.code, session.playerId);
        if (room.wordGame) for (const player of room.players) {
          const target = playerSockets.get(player.id); if (target) io.to(target).emit("word:private-state", engine.getWordPrivateState(room.code, player.id));
        }
        ack({ ok: true, data: room });
      }
      catch (error) { ack(fail(error)); }
    });
    socket.on("room:leave", (raw, ack) => {
      const parsed = clientSchemas["room:leave"].safeParse(raw);
      if (!parsed.success || !session || parsed.data.code !== session.code) return ack(fail(new GameError("UNAUTHORIZED", "Sesión inválida")));
      try { const leaving = session; engine.leaveRoom(leaving.code, leaving.playerId); playerSockets.delete(leaving.playerId); socket.leave(leaving.code); session = null; ack({ ok: true, data: { left: true } }); } catch (error) { ack(fail(error)); }
    });
    socket.on("game:propose", (raw, ack) => {
      const parsed = clientSchemas["game:propose"].safeParse(raw);
      if (!parsed.success || !session) return ack(fail(new GameError("INVALID_PAYLOAD", "Selección inválida")));
      try { ack({ ok: true, data: engine.proposeGame(parsed.data.code, session.playerId, parsed.data.gameId) }); } catch (error) { ack(fail(error)); }
    });
    socket.on("game:ready", (raw, ack) => {
      const parsed = clientSchemas["game:ready"].safeParse(raw);
      if (!parsed.success || !session) return ack(fail(new GameError("INVALID_PAYLOAD", "Confirmación inválida")));
      try { ack({ ok: true, data: engine.setReady(parsed.data.code, session.playerId, parsed.data.ready) }); } catch (error) { ack(fail(error)); }
    });
    socket.on("game:configure", (raw, ack) => {
      const parsed = clientSchemas["game:configure"].safeParse(raw);
      if (!parsed.success || !session) return ack(fail(new GameError("INVALID_PAYLOAD", "Dificultad inválida")));
      try { ack({ ok: true, data: engine.configureGame(parsed.data.code, session.playerId, { difficulty: parsed.data.difficulty, desiredPlayers: parsed.data.desiredPlayers }) }); } catch (error) { ack(fail(error)); }
    });
    socket.on("game:return-to-lobby", (raw, ack) => {
      const parsed = clientSchemas["game:return-to-lobby"].safeParse(raw);
      if (!parsed.success || !session) return ack(fail(new GameError("INVALID_PAYLOAD", "Solicitud inválida")));
      try { ack({ ok: true, data: engine.returnToLobby(parsed.data.code, session.playerId) }); } catch (error) { ack(fail(error)); }
    });
    socket.on("riddle:request-hint", (raw, ack) => {
      const parsed = clientSchemas["riddle:request-hint"].safeParse(raw);
      if (!parsed.success || !session) return ack(fail(new GameError("INVALID_PAYLOAD", "Solicitud inválida")));
      try { engine.requestRiddleHint(parsed.data.code, session.playerId, parsed.data.eventSequence); ack({ ok: true, data: { accepted: true } }); } catch (error) { ack(fail(error)); }
    });
    socket.on("riddle:submit-answer", (raw, ack) => {
      const parsed = clientSchemas["riddle:submit-answer"].safeParse(raw);
      if (!parsed.success || !session) return ack(fail(new GameError("INVALID_PAYLOAD", "Respuesta inválida")));
      try { engine.submitRiddleAnswer(parsed.data.code, session.playerId, parsed.data.answer, parsed.data.eventSequence); ack({ ok: true, data: { accepted: true } }); } catch (error) { ack(fail(error)); }
    });
    socket.on("word:submit-clue", (raw, ack) => {
      const parsed = clientSchemas["word:submit-clue"].safeParse(raw);
      if (!parsed.success || !session) return ack(fail(new GameError("INVALID_PAYLOAD", "Pista inválida")));
      try { engine.submitWordClue(parsed.data.code, session.playerId, parsed.data.clue, parsed.data.eventSequence); ack({ ok: true, data: { accepted: true } }); } catch (error) { ack(fail(error)); }
    });
    socket.on("word:submit-vote", (raw, ack) => {
      const parsed = clientSchemas["word:submit-vote"].safeParse(raw);
      if (!parsed.success || !session) return ack(fail(new GameError("INVALID_PAYLOAD", "Voto inválido")));
      try { engine.submitWordVote(parsed.data.code, session.playerId, parsed.data.vote, parsed.data.eventSequence); ack({ ok: true, data: { accepted: true } }); } catch (error) { ack(fail(error)); }
    });
    socket.on("word:submit-guess", (raw, ack) => {
      const parsed = clientSchemas["word:submit-guess"].safeParse(raw);
      if (!parsed.success || !session) return ack(fail(new GameError("INVALID_PAYLOAD", "Adivinanza inválida")));
      try { engine.submitWordGuess(parsed.data.code, session.playerId, parsed.data.guess, parsed.data.eventSequence); ack({ ok: true, data: { accepted: true } }); } catch (error) { ack(fail(error)); }
    });
    socket.on("puzzle:request-lock", (raw, ack) => {
      const parsed = clientSchemas["puzzle:request-lock"].safeParse(raw);
      if (!parsed.success || !session) return ack(fail(new GameError("INVALID_PAYLOAD", "Pieza inválida")));
      try { ack({ ok: true, data: { granted: engine.requestPuzzleLock(parsed.data.code, session.playerId, parsed.data.pieceId) } }); } catch (error) { ack(fail(error)); }
    });
    socket.on("puzzle:move-piece", (raw) => {
      const parsed = clientSchemas["puzzle:move-piece"].safeParse(raw); if (!parsed.success || !session) return;
      try { engine.movePuzzlePiece(parsed.data.code, session.playerId, parsed.data.pieceId, parsed.data.x, parsed.data.y); } catch { /* movimiento efímero inválido */ }
    });
    socket.on("puzzle:release-piece", (raw, ack) => {
      const parsed = clientSchemas["puzzle:release-piece"].safeParse(raw);
      if (!parsed.success || !session) return ack(fail(new GameError("INVALID_PAYLOAD", "Movimiento inválido")));
      try { ack({ ok: true, data: { placed: engine.releasePuzzlePiece(parsed.data.code, session.playerId, parsed.data.pieceId, parsed.data.targetSlot) } }); } catch (error) { ack(fail(error)); }
    });
    socket.on("story:add", (raw, ack) => { const parsed = clientSchemas["story:add"].safeParse(raw); if (!parsed.success || !session) return ack(fail(new GameError("INVALID_PAYLOAD", "Fragmento inválido"))); try { engine.addStoryEntry(parsed.data.code, session.playerId, parsed.data.text); ack({ ok: true, data: { accepted: true } }); } catch (error) { ack(fail(error)); } });
    socket.on("maze:move", (raw, ack) => { const parsed = clientSchemas["maze:move"].safeParse(raw); if (!parsed.success || !session) return ack(fail(new GameError("INVALID_PAYLOAD", "Movimiento inválido"))); try { engine.moveMaze(parsed.data.code, session.playerId, parsed.data.direction); ack({ ok: true, data: { accepted: true } }); } catch (error) { ack(fail(error)); } });
    socket.on("detective:action", (raw, ack) => { const parsed = clientSchemas["detective:action"].safeParse(raw); if (!parsed.success || !session) return ack(fail(new GameError("INVALID_PAYLOAD", "Acción inválida"))); try { engine.detectiveAction(parsed.data.code, session.playerId, parsed.data.actionId); ack({ ok: true, data: { accepted: true } }); } catch (error) { ack(fail(error)); } });
    socket.on("audio:status", (raw, ack) => {
      const parsed = clientSchemas["audio:status"].safeParse(raw);
      if (!parsed.success || !session || parsed.data.code !== session.code) return ack(fail(new GameError("INVALID_PAYLOAD", "Estado de audio inválido")));
      try { engine.updateAudioStatus(parsed.data.code, session.playerId, parsed.data.enabled, parsed.data.muted); ack({ ok: true, data: { accepted: true } }); } catch (error) { ack(fail(error)); }
    });
    socket.on("audio:signal", (raw) => {
      const parsed = clientSchemas["audio:signal"].safeParse(raw); if (!parsed.success || !session || parsed.data.code !== session.code) return;
      try { const targetIsMember = engine.getRoom(session.code).players.some((player) => player.id === parsed.data.targetPlayerId); const target = playerSockets.get(parsed.data.targetPlayerId); if (targetIsMember && target) io.to(target).emit("audio:signal", { fromPlayerId: session.playerId, kind: parsed.data.kind, data: parsed.data.data }); } catch { /* señal caducada */ }
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
      if (session) playerSockets.delete(session.playerId);
      if (room) io.to(room.code).emit("room:state", room);
    });
  });

  return { app, io, engine };
}
