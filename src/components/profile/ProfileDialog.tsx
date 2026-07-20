import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useApi, type Game, type PublicProfile, type StatRow } from "@/lib/api";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string | null;
  fallbackName?: string | null;
  fallbackAvatar?: string | null;
  games?: Game[];
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || name.slice(0, 2).toUpperCase();
}

function hueOf(userId: string): number {
  let h = 0;
  for (const c of userId) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const s = Math.max(1, Math.floor((now - then) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function rankFor(stat: StatRow | undefined, board: StatRow[] | undefined): number | null {
  if (!stat || !board) return null;
  const sorted = [...board].sort((a, b) => (b.gamerscore ?? 0) - (a.gamerscore ?? 0));
  const i = sorted.findIndex((r) => r.userId === stat.userId);
  return i >= 0 ? i + 1 : null;
}

/** Small SVG line chart of cumulative gamerscore across matches. */
function ScoreChart({ history }: { history: { at: string; delta: number }[] }) {
  const points = useMemo(() => {
    if (!history?.length) return [];
    let cum = 0;
    return history.map((h, i) => {
      cum += h.delta;
      return { i, cum, at: h.at };
    });
  }, [history]);
  if (points.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-white/10 text-xs text-white/50">
        No matches yet.
      </div>
    );
  }
  const w = 360;
  const h = 140;
  const padL = 30;
  const padR = 8;
  const padT = 10;
  const padB = 24;
  const xs = points.map((p) => p.i);
  const ys = points.map((p) => p.cum);
  const minX = 0;
  const maxX = Math.max(1, Math.max(...xs));
  const minY = Math.min(0, ...ys);
  const maxY = Math.max(0, ...ys);
  const spanY = maxY - minY || 1;
  const px = (x: number) => padL + ((x - minX) / (maxX - minX || 1)) * (w - padL - padR);
  const py = (y: number) => h - padB - ((y - minY) / spanY) * (h - padT - padB);
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"} ${px(p.i)} ${py(p.cum)}`).join(" ");
  const zeroY = py(0);
  const last = points[points.length - 1];
  const color = last.cum >= 0 ? "#facc15" : "#fb7185";
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? "" : `${d.getMonth() + 1}/${d.getDate()}`;
  };
  const tickCount = Math.min(4, points.length);
  const xTicks = Array.from({ length: tickCount }, (_, k) => {
    const idx = Math.round((k / Math.max(1, tickCount - 1)) * (points.length - 1));
    return points[idx];
  });
  const yTicks = [minY, minY + spanY / 2, maxY];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-32 w-full" role="img" aria-label="Cumulative gamerscore over time">
      <defs>
        <linearGradient id="scoreFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={padL} x2={w - padR} y1={py(v)} y2={py(v)} stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
          <text x={padL - 5} y={py(v)} textAnchor="end" dominantBaseline="middle" fontSize="9" fill="rgba(255,255,255,0.55)">
            {Math.round(v)}
          </text>
        </g>
      ))}
      <line x1={padL} x2={w - padR} y1={h - padB} y2={h - padB} stroke="rgba(255,255,255,0.2)" />
      {xTicks.map((p, i) => (
        <text key={i} x={px(p.i)} y={h - padB + 12} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.55)">
          {fmt(p.at)}
        </text>
      ))}
      {zeroY > 0 && zeroY < h && (
        <line x1={padL} x2={w - padR} y1={zeroY} y2={zeroY} stroke="rgba(255,255,255,0.25)" />
      )}
      <path d={`${line} L ${px(last.i)} ${zeroY} L ${px(points[0].i)} ${zeroY} Z`} fill="url(#scoreFill)" />
      <path d={line} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle key={i} cx={px(p.i)} cy={py(p.cum)} r={i === points.length - 1 ? 3 : 1.5} fill={color} />
      ))}
      <text x={(padL + w - padR) / 2} y={h - 2} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.5)">
        Date
      </text>
      <text x={-(h / 2)} y={9} transform="rotate(-90)" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.5)">
        Score
      </text>
    </svg>
  );
}

function GameStatCard({
  game,
  stat,
  leaderboard,
}: {
  game: Game;
  stat: StatRow | undefined;
  leaderboard?: StatRow[];
}) {
  const call = useApi();
  const lb = useQuery({
    queryKey: ["leaderboard", game.id],
    queryFn: () => call<{ gameId: string; leaderboard: StatRow[] }>(`/stats/leaderboard?gameId=${encodeURIComponent(game.id)}`),
    initialData: leaderboard ? { gameId: game.id, leaderboard } : undefined,
    staleTime: 30000,
  });
  const rank = rankFor(stat, lb.data?.leaderboard);
  const played = stat?.gamesPlayed ?? 0;
  const won = stat?.gamesWon ?? 0;
  const gamerscore = stat?.gamerscore ?? 0;
  const winRate = played > 0 ? ((won / played) * 100).toFixed(0) : "—";
  return (
    <section className="rounded-lg border border-white/10 bg-black/30 p-4">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-amber-100">{game.name}</h3>
          <p className="text-[11px] text-white/50">Gamerscore rewards big wins and penalizes bad losses.</p>
        </div>
        {rank && (
          <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-xs font-semibold text-amber-200">
            Rank #{rank}
          </span>
        )}
      </header>
      <div className="mb-3 grid grid-cols-4 gap-2 text-center">
        <Stat label="Score" value={gamerscore.toString()} highlight />
        <Stat label="Games" value={played.toString()} />
        <Stat label="Wins" value={won.toString()} />
        <Stat label="Rate" value={winRate === "—" ? "—" : `${winRate}%`} />
      </div>
      <ScoreChart history={stat?.history ?? []} />
    </section>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-md bg-white/5 py-1.5">
      <div className={`text-lg font-bold tabular-nums ${highlight ? "text-amber-200" : "text-white"}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-white/50">{label}</div>
    </div>
  );
}

export function ProfileDialog({ open, onOpenChange, userId, fallbackName, fallbackAvatar, games }: Props) {
  const call = useApi();
  const q = useQuery({
    queryKey: ["profile-user", userId],
    queryFn: () => call<PublicProfile>(`/profile/user/${encodeURIComponent(userId!)}`),
    enabled: open && Boolean(userId),
  });
  const data = q.data;
  const displayName = data?.username || fallbackName || (userId ? `player-${userId.slice(-6)}` : "Player");
  const avatarUrl = data?.avatarUrl || fallbackAvatar || null;
  const totalScore = (data?.stats ?? []).reduce((s, r) => s + (r.gamerscore ?? 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} className="h-14 w-14 rounded-full object-cover ring-2 ring-amber-300/50" />
            ) : (
              <div
                className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold text-white ring-2 ring-amber-300/50"
                style={
                  userId
                    ? { background: `linear-gradient(135deg, hsl(${hueOf(userId)} 65% 45%), hsl(${(hueOf(userId) + 40) % 360} 65% 30%))` }
                    : undefined
                }
              >
                {initialsOf(displayName)}
              </div>
            )}
            <div className="min-w-0">
              <DialogTitle className="truncate text-lg text-amber-100">{displayName}</DialogTitle>
              <DialogDescription className="text-xs">
                Last online {relativeTime(data?.lastActiveAt)}
                {data?.createdAt ? ` · joined ${new Date(data.createdAt).toLocaleDateString()}` : ""}
              </DialogDescription>
            </div>
            <div className="ml-auto text-right">
              <div className="text-2xl font-bold tabular-nums text-amber-200">{totalScore}</div>
              <div className="text-[10px] uppercase tracking-wider text-white/50">Gamerscore</div>
            </div>
          </div>
        </DialogHeader>

        <div className="mt-2 space-y-3">
          {q.isLoading ? (
            <p className="text-sm text-white/60">Loading profile…</p>
          ) : q.isError ? (
            <p className="text-sm text-rose-300">Couldn't load profile.</p>
          ) : (games ?? []).filter((g) => g.status === "available").length === 0 ? (
            <p className="text-sm text-white/60">No games available.</p>
          ) : (
            (games ?? [])
              .filter((g) => g.status === "available")
              .map((g) => (
                <GameStatCard
                  key={g.id}
                  game={g}
                  stat={data?.stats.find((s) => s.gameId === g.id)}
                />
              ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}