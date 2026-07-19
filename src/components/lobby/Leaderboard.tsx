import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { endpoints, useApi, type Game, type StatRow } from "@/lib/api";

type Props = { games: Game[] };

export function Leaderboard({ games }: Props) {
  const availableGames = games.filter((g) => g.status === "available");
  const [gameId, setGameId] = useState<string>(availableGames[0]?.id ?? "");
  const api = useApi();
  const qc = useQueryClient();
  const backfill = useMutation({
    mutationFn: () =>
      api<{ scanned: number; roundsBackfilled: number; matchesBackfilled: number }>(
        "/matches/backfill-stats",
        { method: "POST" }
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leaderboard"] }),
  });

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
        const roundsPlayed = r.roundsPlayed ?? 0;
        const roundsWon = r.roundsWon ?? 0;
        const gamesWon = r.gamesWon ?? 0;
        const winRate = roundsPlayed > 0 ? roundsWon / roundsPlayed : 0;
        return { ...r, roundsPlayed, roundsWon, gamesWon, winRate };
      })
      .sort(
        (a, b) =>
          b.roundsWon - a.roundsWon ||
          b.gamesWon - a.gamesWon ||
          b.winRate - a.winRate
      );
  }, [q.data]);

  if (availableGames.length === 0) return null;

  return (
    <section className="mb-8 rounded-lg border border-border bg-card/80 p-5 backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Leaderboard</h2>
          <p className="text-xs text-muted-foreground">Ranked by round wins.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => backfill.mutate()}
            disabled={backfill.isPending}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            title="Record stats from any completed matches still in the database."
          >
            {backfill.isPending ? "Backfilling…" : "Backfill past games"}
          </button>
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
      </div>
      {backfill.data && (
        <p className="mt-2 text-xs text-muted-foreground">
          Backfilled {backfill.data.roundsBackfilled} round(s) and {backfill.data.matchesBackfilled}{" "}
          match(es) from {backfill.data.scanned} record(s).
        </p>
      )}

      <div className="mt-4 overflow-x-auto">
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rounds played yet. Be the first!</p>
        ) : (
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-2 font-medium">#</th>
                <th className="py-2 pr-2 font-medium">Player</th>
                <th className="py-2 pr-2 text-right font-medium">Rounds</th>
                <th className="py-2 pr-2 text-right font-medium">Round wins</th>
                <th className="py-2 pr-2 text-right font-medium">Game wins</th>
                <th className="py-2 pr-2 text-right font-medium">Win rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.userId} className="border-b border-border/50 last:border-0">
                  <td className="py-2 pr-2 text-muted-foreground">{i + 1}</td>
                  <td className="py-2 pr-2 font-medium">{r.username ?? r.userId.slice(-6)}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{r.roundsPlayed}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{r.roundsWon}</td>
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
