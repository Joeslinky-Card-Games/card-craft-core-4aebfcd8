import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { endpoints, API_URL, type Game } from "@/lib/api";
import { MOCK_GAMES } from "@/lib/mock-games";

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
  const query = useQuery({
    queryKey: ["games"],
    queryFn: () => endpoints.listGames(),
    enabled: Boolean(API_URL),
  });

  const games: Game[] = query.data?.games ?? MOCK_GAMES.map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description,
    minPlayers: 2,
    maxPlayers: 4,
    status: g.status,
  }));

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Lobby</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a game to open a table. Game logic is coming soon.
          </p>
        </div>
      </div>

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
              <button
                disabled
                className="w-full cursor-not-allowed rounded-md border border-dashed border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground"
              >
                Coming soon
              </button>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-10 text-xs text-muted-foreground">
        {API_URL ? "Live from the AWS API." : "AWS API not configured — showing local placeholders."}{" "}
        <Link to="/profile" className="underline hover:text-foreground">
          View profile
        </Link>
      </p>
    </main>
  );
}