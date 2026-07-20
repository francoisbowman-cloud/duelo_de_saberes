import { z } from "zod";

export const roomCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6}$/, "Código inválido");
export const displayNameSchema = z.string().trim().min(1).max(18).transform((name) =>
  name.replace(/[<>\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim(),
).refine((name) => name.length > 0, "Nombre inválido");
export const sessionTokenSchema = z.string().min(32).max(256);

export const clientSchemas = {
  "room:create": z.object({ displayName: displayNameSchema }),
  "room:join": z.object({ code: roomCodeSchema, displayName: displayNameSchema }),
  "room:rejoin": z.object({ code: roomCodeSchema, sessionToken: sessionTokenSchema }),
  "game:start": z.object({ code: roomCodeSchema }),
  "game:submit-answer": z.object({ code: roomCodeSchema, answer: z.union([z.string().max(120), z.number().int().min(0).max(5)]), eventSequence: z.number().int().nonnegative() }),
  ping: z.object({ sentAt: z.number().int().nonnegative() }),
} as const;

export type RoomStatus = "lobby" | "playing" | "paused" | "finished";
export type GamePhase = "question" | "steal" | "reveal" | "finished";

export type PublicQuestion = {
  id: string;
  category: string;
  prompt: string;
  type: "mcq" | "word";
  options?: string[];
};

export type PlayerState = {
  id: string;
  displayName: string;
  connected: boolean;
  score: number;
  streak: number;
  position: number;
  joinedAt: string;
  disconnectedAt: string | null;
};

export type GameState = {
  questionIndex: number;
  round: number;
  phase: GamePhase;
  activePlayerId: string | null;
  currentQuestionId: string | null;
  attemptedPlayerIds: string[];
  deadlineAt: string | null;
  remainingMs: number;
  eventSequence: number;
};

export type RoomState = {
  id: string;
  code: string;
  status: RoomStatus;
  createdAt: string;
  updatedAt: string;
  maxPlayers: number;
  players: PlayerState[];
  game: GameState | null;
};

export type SessionPayload = { room: RoomState; playerId: string; sessionToken: string };

export interface ClientToServerEvents {
  "room:create": (payload: z.input<(typeof clientSchemas)["room:create"]>, ack: (result: Result<SessionPayload>) => void) => void;
  "room:join": (payload: z.input<(typeof clientSchemas)["room:join"]>, ack: (result: Result<SessionPayload>) => void) => void;
  "room:rejoin": (payload: z.input<(typeof clientSchemas)["room:rejoin"]>, ack: (result: Result<SessionPayload>) => void) => void;
  "game:start": (payload: z.input<(typeof clientSchemas)["game:start"]>, ack: (result: Result<RoomState>) => void) => void;
  "game:submit-answer": (payload: z.input<(typeof clientSchemas)["game:submit-answer"]>, ack: (result: Result<{ accepted: true }>) => void) => void;
  ping: (payload: z.input<(typeof clientSchemas)["ping"]>, ack: (result: Result<{ sentAt: number; serverAt: number }>) => void) => void;
}

export interface ServerToClientEvents {
  "room:state": (room: RoomState) => void;
  "game:question": (question: PublicQuestion) => void;
  "game:reveal": (payload: { correct: boolean; playerId: string | null; correctAnswer: string; fact: string }) => void;
  "game:finished": (room: RoomState) => void;
  "session:replaced": () => void;
  error: (payload: AppError) => void;
}

export type AppError = { code: string; message: string };
export type Result<T> = { ok: true; data: T } | { ok: false; error: AppError };
