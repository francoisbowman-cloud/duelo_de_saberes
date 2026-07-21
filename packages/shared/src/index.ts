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
  "room:leave": z.object({ code: roomCodeSchema }),
  "game:start": z.object({ code: roomCodeSchema }),
  "game:propose": z.object({ code: roomCodeSchema, gameId: z.enum(["trivia", "riddles", "word-infiltrator", "shared-puzzle", "shared-story", "maze", "detectives"]) }),
  "game:configure": z.object({ code: roomCodeSchema, difficulty: z.enum(["easy", "medium", "hard"]) }),
  "game:ready": z.object({ code: roomCodeSchema, ready: z.boolean() }),
  "game:return-to-lobby": z.object({ code: roomCodeSchema }),
  "riddle:request-hint": z.object({ code: roomCodeSchema, eventSequence: z.number().int().nonnegative() }),
  "riddle:submit-answer": z.object({ code: roomCodeSchema, answer: z.string().trim().min(1).max(160), eventSequence: z.number().int().nonnegative() }),
  "word:submit-clue": z.object({ code: roomCodeSchema, clue: z.string().trim().min(1).max(50), eventSequence: z.number().int().nonnegative() }),
  "word:submit-vote": z.object({ code: roomCodeSchema, vote: z.enum(["same", "different"]), eventSequence: z.number().int().nonnegative() }),
  "word:submit-guess": z.object({ code: roomCodeSchema, guess: z.string().trim().min(1).max(50), eventSequence: z.number().int().nonnegative() }),
  "puzzle:request-lock": z.object({ code: roomCodeSchema, pieceId: z.string().max(20) }),
  "puzzle:move-piece": z.object({ code: roomCodeSchema, pieceId: z.string().max(20), x: z.number().min(0).max(1), y: z.number().min(0).max(1) }),
  "puzzle:release-piece": z.object({ code: roomCodeSchema, pieceId: z.string().max(20), targetSlot: z.number().int().min(0).max(24).nullable() }),
  "story:add": z.object({ code: roomCodeSchema, text: z.string().trim().min(2).max(280) }),
  "maze:move": z.object({ code: roomCodeSchema, direction: z.enum(["up", "down", "left", "right"]) }),
  "detective:action": z.object({ code: roomCodeSchema, actionId: z.string().min(1).max(40) }),
  "audio:status": z.object({ code: roomCodeSchema, enabled: z.boolean(), muted: z.boolean() }),
  "audio:signal": z.object({ code: roomCodeSchema, targetPlayerId: z.string().uuid(), kind: z.enum(["offer", "answer", "ice"]), data: z.unknown() }),
  "game:submit-answer": z.object({ code: roomCodeSchema, answer: z.union([z.string().max(120), z.number().int().min(0).max(5)]), eventSequence: z.number().int().nonnegative() }),
  ping: z.object({ sentAt: z.number().int().nonnegative() }),
} as const;

export type RoomStatus = "lobby" | "playing" | "paused" | "results" | "finished";
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
  audioEnabled: boolean;
  audioMuted: boolean;
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
  selectedGameId: GameId | null;
  proposedByPlayerId: string | null;
  readyPlayerIds: string[];
  game: GameState | null;
  riddleGame: RiddlePublicState | null;
  wordGame: WordGamePublicState | null;
  puzzleGame: PuzzlePublicState | null;
  storyGame: StoryPublicState | null;
  mazeGame: MazePublicState | null;
  detectiveGame: DetectivePublicState | null;
  gameConfig: { difficulty: "easy" | "medium" | "hard" };
};

export type GameId = "trivia" | "riddles" | "word-infiltrator" | "shared-puzzle" | "shared-story" | "maze" | "detectives";

export type PuzzlePieceState = { id: string; currentX: number; currentY: number; correctSlot: number; isPlaced: boolean; controlledByPlayerId: string | null };
export type PuzzlePublicState = { phase: "playing" | "finished"; imageId: "abstract" | "landscape" | "illustration"; rows: number; columns: number; pieces: Record<string, PuzzlePieceState>; completedPieceIds: string[]; startedAt: number; finishedAt: number | null };
export type StoryPublicState = { phase: "playing" | "finished"; turnPlayerId: string; entries: { playerId: string; text: string; createdAt: string }[]; maxEntries: number };
export type MazePublicState = { phase: "playing" | "finished"; size: number; player: { row: number; column: number }; exit: { row: number; column: number }; walls: string[]; moves: number };
export type DetectivePublicState = { phase: "investigating" | "solved"; caseId: string; title: string; level: number; totalLevels: number; synopsis: string; clues: string[]; journal: string[]; availableActions: { id: string; label: string }[]; startedAt: string; updatedAt: string };

export type WordGamePublicState = {
  phase: "clue_round" | "voting" | "guessing" | "reveal" | "finished";
  roundIndex: number;
  activePlayerId: string | null;
  clues: { playerId: string; clue: string }[];
  submittedVotePlayerIds: string[];
  submittedGuessPlayerIds: string[];
  scores: Record<string, number>;
  eventSequence: number;
  relationType?: "same" | "different";
  revealedWords?: Record<string, string>;
};

export type WordGamePrivateState = { word: string; category: string; difficulty: "easy" | "medium" | "hard" };

export type RiddlePublicState = {
  phase: "solving" | "revealing" | "finished";
  roundIndex: number;
  totalRounds: number;
  prompt: string;
  difficulty: "easy" | "medium" | "hard";
  hints: string[];
  score: number;
  remainingMs: number;
  deadlineAt: string | null;
  eventSequence: number;
  attempts: { playerId: string; answer: string; correct: boolean }[];
  solution?: string;
  explanation?: string;
};

export type SessionPayload = { room: RoomState; playerId: string; sessionToken: string };

export interface ClientToServerEvents {
  "room:create": (payload: z.input<(typeof clientSchemas)["room:create"]>, ack: (result: Result<SessionPayload>) => void) => void;
  "room:join": (payload: z.input<(typeof clientSchemas)["room:join"]>, ack: (result: Result<SessionPayload>) => void) => void;
  "room:rejoin": (payload: z.input<(typeof clientSchemas)["room:rejoin"]>, ack: (result: Result<SessionPayload>) => void) => void;
  "room:leave": (payload: z.input<(typeof clientSchemas)["room:leave"]>, ack: (result: Result<{ left: true }>) => void) => void;
  "game:start": (payload: z.input<(typeof clientSchemas)["game:start"]>, ack: (result: Result<RoomState>) => void) => void;
  "game:propose": (payload: z.input<(typeof clientSchemas)["game:propose"]>, ack: (result: Result<RoomState>) => void) => void;
  "game:ready": (payload: z.input<(typeof clientSchemas)["game:ready"]>, ack: (result: Result<RoomState>) => void) => void;
  "game:configure": (payload: z.input<(typeof clientSchemas)["game:configure"]>, ack: (result: Result<RoomState>) => void) => void;
  "game:return-to-lobby": (payload: z.input<(typeof clientSchemas)["game:return-to-lobby"]>, ack: (result: Result<RoomState>) => void) => void;
  "riddle:request-hint": (payload: z.input<(typeof clientSchemas)["riddle:request-hint"]>, ack: (result: Result<{ accepted: true }>) => void) => void;
  "riddle:submit-answer": (payload: z.input<(typeof clientSchemas)["riddle:submit-answer"]>, ack: (result: Result<{ accepted: true }>) => void) => void;
  "word:submit-clue": (payload: z.input<(typeof clientSchemas)["word:submit-clue"]>, ack: (result: Result<{ accepted: true }>) => void) => void;
  "word:submit-vote": (payload: z.input<(typeof clientSchemas)["word:submit-vote"]>, ack: (result: Result<{ accepted: true }>) => void) => void;
  "word:submit-guess": (payload: z.input<(typeof clientSchemas)["word:submit-guess"]>, ack: (result: Result<{ accepted: true }>) => void) => void;
  "puzzle:request-lock": (payload: z.input<(typeof clientSchemas)["puzzle:request-lock"]>, ack: (result: Result<{ granted: boolean }>) => void) => void;
  "puzzle:move-piece": (payload: z.input<(typeof clientSchemas)["puzzle:move-piece"]>) => void;
  "puzzle:release-piece": (payload: z.input<(typeof clientSchemas)["puzzle:release-piece"]>, ack: (result: Result<{ placed: boolean }>) => void) => void;
  "story:add": (payload: z.input<(typeof clientSchemas)["story:add"]>, ack: (result: Result<{ accepted: true }>) => void) => void;
  "maze:move": (payload: z.input<(typeof clientSchemas)["maze:move"]>, ack: (result: Result<{ accepted: true }>) => void) => void;
  "detective:action": (payload: z.input<(typeof clientSchemas)["detective:action"]>, ack: (result: Result<{ accepted: true }>) => void) => void;
  "audio:status": (payload: z.input<(typeof clientSchemas)["audio:status"]>, ack: (result: Result<{ accepted: true }>) => void) => void;
  "audio:signal": (payload: z.input<(typeof clientSchemas)["audio:signal"]>) => void;
  "game:submit-answer": (payload: z.input<(typeof clientSchemas)["game:submit-answer"]>, ack: (result: Result<{ accepted: true }>) => void) => void;
  ping: (payload: z.input<(typeof clientSchemas)["ping"]>, ack: (result: Result<{ sentAt: number; serverAt: number }>) => void) => void;
}

export interface ServerToClientEvents {
  "room:state": (room: RoomState) => void;
  "game:question": (question: PublicQuestion) => void;
  "game:reveal": (payload: { correct: boolean; playerId: string | null; correctAnswer: string; fact: string }) => void;
  "game:finished": (room: RoomState) => void;
  "riddle:state": (state: RiddlePublicState) => void;
  "word:state": (state: WordGamePublicState) => void;
  "word:private-state": (state: WordGamePrivateState) => void;
  "puzzle:state": (state: PuzzlePublicState) => void;
  "audio:signal": (payload: { fromPlayerId: string; kind: "offer" | "answer" | "ice"; data: unknown }) => void;
  "session:replaced": () => void;
  error: (payload: AppError) => void;
}

export type AppError = { code: string; message: string };
export type Result<T> = { ok: true; data: T } | { ok: false; error: AppError };
