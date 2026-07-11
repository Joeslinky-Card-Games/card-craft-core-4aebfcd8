// Client for the AWS SAM backend. Set VITE_API_URL in Vercel to the
// API Gateway invoke URL (e.g. https://xxx.execute-api.us-east-1.amazonaws.com).
import { useAuth } from "@clerk/tanstack-react-start";

export const API_URL = import.meta.env.VITE_API_URL as string | undefined;

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
  gameId: string;
  status: "open" | "in-progress" | "complete";
  createdAt: string;
  createdBy: string;
  players: string[];
  maxPlayers: number;
};

export type Profile = {
  userId: string;
  username: string;
  createdAt: string;
  updatedAt?: string;
};

export type StatRow = {
  userId: string;
  gameId: string;
  rating?: number;
  wins?: number;
  losses?: number;
};

export const endpoints = {
  listGames: () => apiFetch<{ games: Game[] }>("/games"),
  listMatches: () => apiFetch<{ matches: Match[] }>("/matches"),
  leaderboard: (gameId: string) =>
    apiFetch<{ gameId: string; leaderboard: StatRow[] }>(
      `/stats/leaderboard?gameId=${encodeURIComponent(gameId)}`,
    ),
};