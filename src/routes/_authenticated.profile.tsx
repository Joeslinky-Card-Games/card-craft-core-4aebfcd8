import { createFileRoute } from "@tanstack/react-router";
import { useUser } from "@clerk/tanstack-react-start";
import { useQuery } from "@tanstack/react-query";
import { useApi, endpoints, type Game, type PublicProfile } from "@/lib/api";
import { useMemo, useState } from "react";
import { ProfileDialog } from "@/components/profile/ProfileDialog";
import { Button } from "@/components/ui/button";

function GamerscoreChart({ history }: { history: { at: string; delta: number }[] }) {
  const points = useMemo(() => {
    let cum = 0;
    return history.map((h, i) => {
      cum += h.delta;
      return { i, cum, at: h.at };
    });
  }, [history]);
  if (points.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
        No completed games yet.
      </div>
    );
  }
  const w = 640;
  const h = 180;
  const padL = 32;
  const padR = 12;
  const padT = 12;
  const padB = 28;
  const xs = points.map((p) => p.i);
  const ys = points.map((p) => p.cum);
  const maxX = Math.max(1, Math.max(...xs));
  const minY = Math.min(0, ...ys);
  const maxY = Math.max(0, ...ys);
  const spanY = maxY - minY || 1;
  const px = (x: number) => padL + (x / (maxX || 1)) * (w - padL - padR);
  const py = (y: number) => h - padB - ((y - minY) / spanY) * (h - padT - padB);
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"} ${px(p.i)} ${py(p.cum)}`).join(" ");
  const zeroY = py(0);
  const last = points[points.length - 1];
  const color = last.cum >= 0 ? "#f59e0b" : "#fb7185";
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? "" : `${d.getMonth() + 1}/${d.getDate()}`;
  };
  const tickCount = Math.min(5, points.length);
  const xTicks = Array.from({ length: tickCount }, (_, k) => {
    const idx = Math.round((k / Math.max(1, tickCount - 1)) * (points.length - 1));
    return points[idx];
  });
  const yTicks = [minY, minY + spanY / 2, maxY];
  const fmtFull = (iso: string) => {
    const d = new Date(iso);
    return isNaN(d.getTime())
      ? ""
      : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  };
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-44 w-full" role="img" aria-label="Cumulative gamerscore over time">
      <defs>
        <linearGradient id="gsFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* y-axis grid + labels */}
      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={padL} x2={w - padR} y1={py(v)} y2={py(v)} stroke="currentColor" strokeOpacity="0.1" strokeDasharray="3 3" />
          <text x={padL - 6} y={py(v)} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="currentColor" fillOpacity="0.6">
            {Math.round(v)}
          </text>
        </g>
      ))}
      {/* x-axis */}
      <line x1={padL} x2={w - padR} y1={h - padB} y2={h - padB} stroke="currentColor" strokeOpacity="0.25" />
      {xTicks.map((p, i) => (
        <text key={i} x={px(p.i)} y={h - padB + 14} textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.6">
          {fmt(p.at)}
        </text>
      ))}
      {zeroY > 0 && zeroY < h && (
        <line x1={padL} x2={w - padR} y1={zeroY} y2={zeroY} stroke="currentColor" strokeOpacity="0.3" />
      )}
      <path d={`${line} L ${px(last.i)} ${zeroY} L ${px(points[0].i)} ${zeroY} Z`} fill="url(#gsFill)" />
      <path d={line} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={px(p.i)} cy={py(p.cum)} r={i === points.length - 1 ? 3 : 1.5} fill={color} />
          <circle cx={px(p.i)} cy={py(p.cum)} r={10} fill="transparent" style={{ cursor: "pointer" }}>
            <title>{`${fmtFull(p.at)} — Score: ${p.cum}`}</title>
          </circle>
        </g>
      ))}
      {/* axis titles */}
      <text x={(padL + w - padR) / 2} y={h - 2} textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.55">
        Date
      </text>
      <text
        x={-(h / 2)}
        y={10}
        transform="rotate(-90)"
        textAnchor="middle"
        fontSize="10"
        fill="currentColor"
        fillOpacity="0.55"
      >
        Score
      </text>
    </svg>
  );
}

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Profile — ArcadiumX" },
      { name: "description", content: "Your ArcadiumX account." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = useUser();
  const call = useApi();
  const [open, setOpen] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<string | null>(null);

  const gamesQ = useQuery({
    queryKey: ["games"],
    queryFn: () => endpoints.listGames(),
    staleTime: 60_000,
  });
  const profileQ = useQuery({
    queryKey: ["profile-user", user?.id],
    queryFn: () => call<PublicProfile>(`/profile/user/${encodeURIComponent(user!.id)}`),
    enabled: Boolean(user?.id),
  });

  const totalScore = useMemo(
    () => (profileQ.data?.stats ?? []).reduce((s, r) => s + (r.gamerscore ?? 0), 0),
    [profileQ.data],
  );

  const history = useMemo(() => {
    const all: { at: string; delta: number }[] = [];
    for (const s of profileQ.data?.stats ?? []) {
      for (const h of s.history ?? []) all.push({ at: h.at, delta: h.delta });
    }
    return all.sort((a, b) => a.at.localeCompare(b.at));
  }, [profileQ.data]);

  if (!user) return null;

  const runBackfill = async () => {
    setBackfilling(true);
    setBackfillResult(null);
    try {
      const res = await call<{ scanned: number; gamerscoreRowsRecomputed: number }>(
        "/matches/backfill-stats",
        { method: "POST" },
      );
      setBackfillResult(
        `Scanned ${res.scanned} matches, recomputed ${res.gamerscoreRowsRecomputed} stat rows.`,
      );
      // Refresh profile data.
      window.location.reload();
    } catch (err) {
      setBackfillResult(`Backfill failed: ${(err as Error).message}`);
    } finally {
      setBackfilling(false);
    }
  };

  const rows: Array<{ label: string; value: string | null | undefined }> = [
    { label: "Display name", value: user.fullName ?? user.username },
    { label: "Email", value: user.primaryEmailAddress?.emailAddress },
    { label: "User ID", value: user.id },
    { label: "Joined", value: user.createdAt?.toLocaleDateString() },
  ];

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12 pb-24">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">Profile</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Account managed by Clerk. Game stats will appear here once the backend is wired.
      </p>

      <div className="mt-8 flex items-center gap-4">
        {user.imageUrl && (
          <img
            src={user.imageUrl}
            alt=""
            className="h-16 w-16 rounded-full border border-border object-cover"
          />
        )}
        <div className="flex-1">
          <div className="text-lg font-semibold text-foreground">
            {user.fullName ?? user.username ?? "Player"}
          </div>
          <div className="text-sm text-muted-foreground">
            {user.primaryEmailAddress?.emailAddress}
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tabular-nums text-amber-500">{totalScore}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Gamerscore</div>
        </div>
      </div>

      <dl className="mt-10 divide-y divide-border rounded-lg border border-border bg-card">
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between gap-6 px-5 py-4">
            <dt className="text-sm text-muted-foreground">{row.label}</dt>
            <dd className="max-w-[60%] truncate text-sm text-foreground">
              {row.value ?? "—"}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Gamerscore over time</h2>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-block h-0.5 w-4 rounded bg-amber-500" />
            <span>Cumulative score</span>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <GamerscoreChart history={history} />
        </div>
      </div>

      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Game stats</h2>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={runBackfill} disabled={backfilling}>
              {backfilling ? "Running…" : "Run backfill"}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setOpen(true)} disabled={profileQ.isLoading}>
              View full profile
            </Button>
          </div>
        </div>
        {backfillResult && (
          <p className="mb-3 text-xs text-muted-foreground">{backfillResult}</p>
        )}
        {profileQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading stats…</p>
        ) : profileQ.isError ? (
          <p className="text-sm text-rose-500">Couldn't load stats.</p>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border bg-card">
            {(gamesQ.data?.games ?? []).filter((g) => g.status === "available").map((g: Game) => {
              const s = profileQ.data?.stats.find((x) => x.gameId === g.id);
              const played = s?.gamesPlayed ?? 0;
              const won = s?.gamesWon ?? 0;
              const score = s?.gamerscore ?? 0;
              const rate = played > 0 ? `${Math.round((won / played) * 100)}%` : "—";
              return (
                <div key={g.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{g.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {played} games · {won} wins · {rate}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold tabular-nums text-amber-500">{score}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Score</div>
                  </div>
                </div>
              );
            })}
            {(gamesQ.data?.games ?? []).filter((g) => g.status === "available").length === 0 && (
              <p className="px-5 py-4 text-sm text-muted-foreground">No games available.</p>
            )}
          </div>
        )}
      </div>

      <ProfileDialog
        open={open}
        onOpenChange={setOpen}
        userId={user.id}
        fallbackName={user.fullName ?? user.username ?? null}
        fallbackAvatar={user.imageUrl ?? null}
        games={gamesQ.data?.games}
      />
    </main>
  );
}