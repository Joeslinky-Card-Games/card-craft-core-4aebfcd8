import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useUser } from "@clerk/tanstack-react-start";
import { API_URL, apiFetch, endpoints, useApi, type CreateMatchPayload, type Game, type Match } from "@/lib/api";
import { useClerkIdentity } from "@/lib/identity";
import { MOCK_GAMES } from "@/lib/mock-games";
import { Button } from "@/components/ui/button";
import { CreateTableDialog } from "@/components/lobby/CreateTableDialog";
import { JoinDialog } from "@/components/lobby/JoinDialog";

export const Route = createFileRoute("/_authenticated/lobby")({
  head: () => ({
    meta: [
      { title: "Lobby — Card Table" },
      { name: "description", content: "Browse and join card game tables." },
    ],
  }),
  component: LobbyPage,
});

function LobbyPage() {
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useUser();
  const userId = user?.id ?? "";
  const identity = useClerkIdentity();
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [joinOpen, setJoinOpen] = useState(false);

  const gamesQuery = useQuery({
    queryKey: ["games"],
    queryFn: () => endpoints.listGames(),
    enabled: Boolean(API_URL),
  });
  const myMatchesQuery = useQuery({
    queryKey: ["matches", "mine"],
    queryFn: () => api<{ matches: Match[] }>("/matches/mine"),
    enabled: Boolean(API_URL),
    refetchInterval: 5000,
  });

  const games: Game[] = gamesQuery.data?.games ?? MOCK_GAMES.map((g) => ({
    id: g.id, name: g.name, description: g.description,
    minPlayers: 2, maxPlayers: 4, status: g.status,
  }));

  const createMut = useMutation({
    mutationFn: (payload: CreateMatchPayload) =>
      api<Match>("/matches", { method: "POST", body: { ...identity, ...payload } }),
    onSuccess: (m) => {
      qc.invalidateQueries({ queryKey: ["matches", "mine"] });
      setSelectedGame(null);
      navigate({ to: "/match/$matchId", params: { matchId: m.matchId } });
    },
  });

  const myMatches = myMatchesQuery.data?.matches ?? [];
  const activeGame = games.find((g) => g.id === selectedGame) ?? null;
  // Silence unused-import warning for apiFetch (kept for symmetry with older code).
  void apiFetch;

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Lobby</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Start a new table or join an existing one — public or by ID.
          </p>
        </div>
        <Button onClick={() => setJoinOpen(true)} disabled={!API_URL}>
          Join table
        </Button>
      </div>

      {!API_URL && (
        <div className="mb-6 rounded-md border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          Backend not configured — set <code>VITE_API_URL</code> to your API Gateway URL.
        </div>
      )}

      {myMatches.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold">Your tables</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Rejoin a table you're already seated at.
          </p>
          <ul className="divide-y divide-border rounded-md border border-border">
            {myMatches.map((m) => {
              const gameName = games.find((g) => g.id === m.gameId)?.name ?? m.gameId;
              return (
                <li key={m.matchId} className="flex items-center justify-between px-4 py-3 text-sm">
                  <div>
                    <div className="font-medium">
                      {gameName}
                      {m.visibility === "private" && (
                        <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-amber-500">
                          Private
                        </span>
                      )}
                        {m.code && (
                          <span className="ml-2 rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] tracking-widest text-muted-foreground">
                            {m.code}
                          </span>
                        )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {m.status} · {m.players.length}/{m.maxPlayers} players · created {new Date(m.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => navigate({ to: "/match/$matchId", params: { matchId: m.matchId } })}
                  >
                    Rejoin
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {games.map((game) => (
          <div
            key={game.id}
            className="flex flex-col justify-between rounded-lg border border-border bg-card p-6 transition-colors hover:border-primary/40"
          >
            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-card-foreground">{game.name}</h2>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {game.minPlayers === game.maxPlayers
                    ? `${game.maxPlayers} players`
                    : `${game.minPlayers}–${game.maxPlayers} players`}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{game.description}</p>
            </div>
            <div className="mt-6">
              {game.status === "available" ? (
                <button
                  onClick={() => setSelectedGame(game.id)}
                  className="w-full rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90"
                >
                  Create table
                </button>
              ) : (
                <button
                  disabled
                  className="w-full cursor-not-allowed rounded-md border border-dashed border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground"
                >
                  Coming soon
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <CreateTableDialog
        game={activeGame}
        open={Boolean(selectedGame)}
        onOpenChange={(v) => { if (!v) setSelectedGame(null); }}
        onSubmit={(payload) => createMut.mutate(payload)}
        pending={createMut.isPending}
        error={createMut.error instanceof Error ? createMut.error.message : null}
      />

      <JoinDialog
        open={joinOpen}
        onOpenChange={setJoinOpen}
        games={games}
        userId={userId}
        identity={identity}
      />
    </main>
  );
}