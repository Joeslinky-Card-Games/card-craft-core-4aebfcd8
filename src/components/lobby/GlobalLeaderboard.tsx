import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { endpoints, type Game, type StatRow } from "@/lib/api";
import { ProfileDialog } from "@/components/profile/ProfileDialog";

type Props = { games: Game[] };

export function GlobalLeaderboard({ games }: Props) {
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["leaderboard", "global"],
    queryFn: () => endpoints.leaderboard("global"),
    refetchInterval: 60000,
  });

  const rows = useMemo(() => {
    const items = (q.data?.leaderboard ?? []) as StatRow[];
    return items
      .map((r) => ({
        ...r,
        gamerscore: r.gamerscore ?? 0,
        gamesPlayed: r.gamesPlayed ?? 0,
        gamesWon: r.gamesWon ?? 0,
      }))
      .sort((a, b) => b.gamerscore - a.gamerscore || b.gamesWon - a.gamesWon);
  }, [q.data]);

  return (
    <section className="mb-8 rounded-lg border border-border bg-card/80 p-5 backdrop-blur-sm">
      <div>
        <h2 className="text-lg font-semibold">Global leaderboard</h2>
        <p className="text-xs text-muted-foreground">
          Top players across every game, ranked by total gamerscore.
        </p>
      </div>

      <div className="mt-4">
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No games played yet. Be the first!</p>
        ) : (
          <table className="w-full table-fixed text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="w-8 py-2 pr-1 font-medium">#</th>
                <th className="py-2 pr-1 font-medium">Player</th>
                <th className="w-16 py-2 pr-1 text-right font-medium sm:w-24">
                  <span className="sm:hidden">Score</span>
                  <span className="hidden sm:inline">Gamerscore</span>
                </th>
                <th className="w-10 py-2 pr-1 text-right font-medium sm:w-14">
                  <span className="sm:hidden">G</span>
                  <span className="hidden sm:inline">Games</span>
                </th>
                <th className="w-10 py-2 pr-1 text-right font-medium sm:w-14">
                  <span className="sm:hidden">W</span>
                  <span className="hidden sm:inline">Wins</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.userId} className="border-b border-border/50 last:border-0">
                  <td className="py-2 pr-1 text-muted-foreground">{i + 1}</td>
                  <td className="py-2 pr-1 font-medium">
                    <button
                      type="button"
                      className="max-w-full truncate underline-offset-2 hover:text-amber-200 hover:underline"
                      onClick={() => {
                        setProfileName(r.username ?? null);
                        setProfileUserId(r.userId);
                      }}
                    >
                      {r.username ?? r.userId.slice(-6)}
                    </button>
                  </td>
                  <td className="py-2 pr-1 text-right font-semibold tabular-nums text-amber-200">
                    {r.gamerscore}
                  </td>
                  <td className="py-2 pr-1 text-right tabular-nums">{r.gamesPlayed}</td>
                  <td className="py-2 pr-1 text-right tabular-nums">{r.gamesWon}</td>
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