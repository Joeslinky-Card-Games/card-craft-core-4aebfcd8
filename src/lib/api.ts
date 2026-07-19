// Client for the AWS SAM backend. Set VITE_API_URL in Vercel to the
// API Gateway invoke URL (e.g. https://xxx.execute-api.us-east-1.amazonaws.com).
import { useAuth } from "@clerk/tanstack-react-start";

export const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ||
  "https://api.arcadiumx.app";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type RequestOpts = {
  method?: string;
  body?: unknown;
  token?: string | null;
};

export async function apiFetch<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  if (!API_URL) {
    throw new ApiError(0, "VITE_API_URL is not configured");
  }
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;

  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? res.statusText);
  }
  return data as T;
}

/** Hook that returns an authed fetch bound to the current Clerk session. */
export function useApi() {
  const { getToken } = useAuth();
  return async <T,>(path: string, opts: Omit<RequestOpts, "token"> = {}) => {
    const token = await getToken();
    return apiFetch<T>(path, { ...opts, token });
  };
}

// -------- Types --------

export type Game = {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  status: "available" | "coming-soon";
};

export type Match = {
  matchId: string;
  code?: string;
  gameId: string;
  status: "open" | "in-progress" | "round-complete" | "complete";
  createdAt: string;
  createdBy: string;
  players: string[];
  usernames?: Record<string, string>;
  avatars?: Record<string, string>;
  maxPlayers: number;
  minPlayers?: number;
  version?: number;
  visibility?: "public" | "private";
  aiPlayers?: string[];
};

/** Per-user redacted match view returned by GET /matches/{id}, POST /start, /action, /next-round. */
export type MatchView = Match & {
  round?: number;
  handSize?: number;
  wildRank?: string | null;
  turn?: number;
  discard?: string[];
  stockCount?: number;
  hands?: Record<string, string[]>; // caller's hand during play; all hands after round/match complete
  handCounts?: Record<string, number>;
  scores?: Record<string, number>;
  lastRoundScores?: Record<string, number> | null;
  goneOutBy?: string | null;
  remainingFinalTurns?: number;
  hasDrawn?: boolean;
  laidMelds?: Record<string, string[][]>;
  winner?: string;
  chatMessages?: ChatMessage[];
  playAgain?: string[];
  // ---- Stack Attack ----
  stocks?: Record<string, string[]>;
  stockCounts?: Record<string, number>;
  stockTops?: Record<string, string | null>;
  discards?: Record<string, string[][]>;
  buildPiles?: { card: string; asRank: number }[][];
  drawPileCount?: number;
  archiveCount?: number;
  completedCount?: number;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  _order?: string[];
};

export type ChatMessage = {
  id: string;
  userId: string;
  text: string;
  at: number;
};

export type GameAction =
  | { type: "draw-stock" }
  | { type: "draw-discard" }
  | { type: "discard"; card: string }
  | { type: "lay-down"; melds: string[][]; discard: string };

export type Profile = {
  userId: string;
  username: string;
  createdAt: string;
  updatedAt?: string;
};

export type StatRow = {
  userId: string;
  gameId: string;
  username?: string;
  rating?: number;
  wins?: number;
  losses?: number;
  gamesPlayed?: number;
  gamesWon?: number;
  roundsPlayed?: number;
  roundsWon?: number;
  totalPoints?: number;
  updatedAt?: string;
};

export const endpoints = {
  listGames: () => apiFetch<{ games: Game[] }>("/games"),
  listMatches: () => apiFetch<{ matches: Match[] }>("/matches"),
  leaderboard: (gameId: string) =>
    apiFetch<{ gameId: string; leaderboard: StatRow[] }>(
      `/stats/leaderboard?gameId=${encodeURIComponent(gameId)}`,
    ),
  runtime: (gameId: string) =>
    apiFetch<RuntimeStats>(`/games/${encodeURIComponent(gameId)}/runtime`),
};

export type RuntimeStats = {
  gameId: string;
  byPlayers: Record<string, { avgMs: number; count: number }>;
  overallAvgMs: number | null;
  totalCount: number;
};

export type CreateMatchPayload = {
  gameId: string;
  maxPlayers: number;
  visibility?: "public" | "private";
  password?: string;
  displayName?: string;
  avatarUrl?: string;
  aiCount?: number;
};

export type JoinMatchPayload = {
  password?: string;
  displayName?: string;
  avatarUrl?: string;
};