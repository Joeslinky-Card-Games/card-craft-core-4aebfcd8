import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { endpoints, type Game, type StatRow } from "@/lib/api";
import { ProfileDialog } from "@/components/profile/ProfileDialog";

type Props = { games: Game[]; gameId?: string };

export function Leaderboard({ games, gameId: fixedGameId }: Props) {
  const availableGames = games.filter((g) => g.status === "available");
  const [gameId, setGameId] = useState<string>(fixedGameId ?? availableGames[0]?.id ?? "");
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);

  useEffect(() => {
    if (fixedGameId) {
      if (gameId !== fixedGameId) setGameId(fixedGameId);
      return;
    }
    if (availableGames.length === 0) return;
    if (!gameId || !availableGames.some((g) => g.id === gameId)) {
      setGameId(availableGames[0].id);
    }
  }, [availableGames, gameId, fixedGameId]);

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
        const gamesPlayed = r.gamesPlayed ?? 0;
        const gamesWon = r.gamesWon ?? 0;
        const totalPoints = r.totalPoints ?? 0;
        const avgPoints = gamesPlayed > 0 ? totalPoints / gamesPlayed : null;
        const winRate = gamesPlayed > 0 ? gamesWon / gamesPlayed : 0;
        return { ...r, gamesPlayed, gamesWon, totalPoints, avgPoints, winRate };
      })
      .sort(
        (a, b) =>
          b.gamesWon - a.gamesWon ||
          b.winRate - a.winRate ||
          b.gamesPlayed - a.gamesPlayed
      );
  }, [q.data]);

  if (availableGames.length === 0) return null;

  return (
    <section className="mb-8 rounded-lg border border-border bg-card/80 p-5 backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Leaderboard</h2>
          <p className="text-xs text-muted-foreground">Ranked by game wins. Avg points per game shown as a handicap (lower is better).</p>
        </div>
        {!fixedGameId && availableGames.length > 1 && (
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
                <th className="py-2 pr-2 text-right font-medium">Games</th>
                <th className="py-2 pr-2 text-right font-medium">Wins</th>
                <th className="py-2 pr-2 text-right font-medium">Win rate</th>
                <th className="py-2 pr-2 text-right font-medium">Avg pts</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.userId} className="border-b border-border/50 last:border-0">
                  <td className="py-2 pr-2 text-muted-foreground">{i + 1}</td>
                  <td className="py-2 pr-2 font-medium">
                    <button
                      type="button"
                      className="underline-offset-2 hover:text-amber-200 hover:underline"
                      onClick={() => {
                        setProfileName(r.username ?? null);
                        setProfileUserId(r.userId);
                      }}
                    >
                      {r.username ?? r.userId.slice(-6)}
                    </button>
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums">{r.gamesPlayed}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{r.gamesWon}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">
                    {(r.winRate * 100).toFixed(0)}%
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums">
                    {r.avgPoints == null ? "—" : r.avgPoints.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <ProfileDialog
        open={Boolean(profileUserId)}
        onOpenChange={(v) => { if (!v) setProfileUserId(null); }}
        userId={profileUserId}
        fallbackName={profileName}
        games={games}
      />
    </section>
  );
}
