import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { endpoints, type Game, type StatRow } from "@/lib/api";

type Props = { games: Game[] };

export function Leaderboard({ games }: Props) {
  const availableGames = games.filter((g) => g.status === "available");
  const [gameId, setGameId] = useState<string>(availableGames[0]?.id ?? "");

  const q = useQuery({
    queryKey: ["leaderboard", gameId],
    queryFn: () => endpoints.leaderboard(gameId),
    enabled: Boolean(gameId),
    refetchInterval: 30000,
  });

  const rows = useMemo(() => {
    const items = (q.data?.leaderboard ?? []) as StatRow[];
    return items
      .map((r) => {
        const played = r.gamesPlayed ?? 0;
        const won = r.gamesWon ?? 0;
        const winRate = played > 0 ? won / played : 0;
        return { ...r, gamesPlayed: played, gamesWon: won, winRate };
      })
      .sort((a, b) => b.gamesWon - a.gamesWon || b.winRate - a.winRate);
  }, [q.data]);

  if (availableGames.length === 0) return null;

  return (
    <section className="mb-8 rounded-lg border border-border bg-card/80 p-5 backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Leaderboard</h2>
          <p className="text-xs text-muted-foreground">Top players ranked by wins.</p>
        </div>
        {availableGames.length > 1 && (
          <select
            value={gameId}
            onChange={(e) => setGameId(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-sm"
          >
            {availableGames.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        )}
      </div>

      <div className="mt-4 overflow-x-auto">
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No games played yet. Be the first!</p>
        ) : (
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-2 font-medium">#</th>
                <th className="py-2 pr-2 font-medium">Player</th>
                <th className="py-2 pr-2 text-right font-medium">Played</th>
                <th className="py-2 pr-2 text-right font-medium">Won</th>
                <th className="py-2 pr-2 text-right font-medium">Win rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.userId} className="border-b border-border/50 last:border-0">
                  <td className="py-2 pr-2 text-muted-foreground">{i + 1}</td>
                  <td className="py-2 pr-2 font-medium">{r.username ?? r.userId.slice(-6)}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{r.gamesPlayed}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{r.gamesWon}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">
                    {(r.winRate * 100).toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
