import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useUser } from "@clerk/tanstack-react-start";
import { API_URL, apiFetch, endpoints, useApi, type Game, type Match } from "@/lib/api";
import { useClerkIdentity } from "@/lib/identity";
import { MOCK_GAMES } from "@/lib/mock-games";
import { Button } from "@/components/ui/button";
import { JoinDialog } from "@/components/lobby/JoinDialog";
import { GameMenuDialog } from "@/components/lobby/GameMenuDialog";
import { RuntimeChip } from "@/components/lobby/RuntimeChip";
import { MyTableRow } from "@/components/lobby/MyTableRow";

export const Route = createFileRoute("/_authenticated/lobby")({
  head: () => ({
    meta: [
      { title: "Lobby — ArcadiumX" },
      { name: "description", content: "Browse and join card game tables." },
    ],
  }),
  component: LobbyPage,
});

function LobbyPage() {
  const api = useApi();
  const navigate = useNavigate();
  const { user } = useUser();
  const userId = user?.id ?? "";
  const identity = useClerkIdentity();
  const [menuGameId, setMenuGameId] = useState<string | null>(null);
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

  const myMatches = myMatchesQuery.data?.matches ?? [];
  const activeGame = games.find((g) => g.id === menuGameId) ?? null;
  // Silence unused-import warnings for symmetry.
  void apiFetch;
  void api;
  void identity;

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Ambient lobby background */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -10%, color-mix(in oklab, var(--primary) 25%, transparent), transparent 60%), radial-gradient(ellipse 60% 40% at 110% 80%, color-mix(in oklab, var(--accent) 15%, transparent), transparent 50%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, currentColor 0, currentColor 1px, transparent 0, transparent 50%), repeating-linear-gradient(-45deg, currentColor 0, currentColor 1px, transparent 0, transparent 50%)",
          backgroundSize: "40px 40px",
        }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-[5%] top-[12%] select-none text-[clamp(8rem,20vw,16rem)] leading-none text-primary/[0.04]"
      >
        ♠
      </span>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-[8%] top-[20%] select-none text-[clamp(7rem,18vw,14rem)] leading-none text-primary/[0.04]"
      >
        ♥
      </span>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[18%] left-[10%] select-none text-[clamp(9rem,22vw,18rem)] leading-none text-primary/[0.04]"
      >
        ♦
      </span>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[22%] right-[12%] select-none text-[clamp(7rem,16vw,13rem)] leading-none text-primary/[0.04]"
      >
        ♣
      </span>

      <main className="relative z-10 mx-auto max-w-6xl px-6 py-12">
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
                  <MyTableRow
                    key={m.matchId}
                    match={m}
                    gameName={gameName}
                    onRejoin={() => navigate({ to: "/match/$matchId", params: { matchId: m.matchId } })}
                  />
                );
              })}
            </ul>
          </section>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((game) => (
            <button
              key={game.id}
              type="button"
              onClick={() => game.status === "available" && setMenuGameId(game.id)}
              disabled={game.status !== "available"}
              className="group flex flex-col justify-between rounded-lg border border-border bg-card/80 p-6 text-left shadow-sm backdrop-blur-sm transition-all hover:border-primary/40 hover:bg-card hover:shadow-md disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:border-border disabled:hover:bg-card/80 disabled:hover:shadow-sm"
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
                {game.status === "available" && (
                  <div className="mt-3">
                    <RuntimeChip gameId={game.id} />
                  </div>
                )}
              </div>
              <div className="mt-6 text-sm">
                {game.status === "available" ? (
                  <span className="inline-flex items-center gap-1 text-primary group-hover:underline">
                    Open menu →
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Coming soon</span>
                )}
              </div>
            </button>
          ))}
        </div>

        <GameMenuDialog
          game={activeGame}
          open={Boolean(menuGameId)}
          onOpenChange={(v) => { if (!v) setMenuGameId(null); }}
          games={games}
          myMatches={myMatches}
          onJoinTable={() => setJoinOpen(true)}
        />

        <JoinDialog
          open={joinOpen}
          onOpenChange={setJoinOpen}
          games={games}
          userId={userId}
          identity={identity}
        />
      </main>
    </div>
  );
}