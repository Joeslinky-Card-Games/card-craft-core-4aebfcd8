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
  const h = 140;
  const pad = 12;
  const xs = points.map((p) => p.i);
  const ys = points.map((p) => p.cum);
  const maxX = Math.max(1, Math.max(...xs));
  const minY = Math.min(0, ...ys);
  const maxY = Math.max(0, ...ys);
  const spanY = maxY - minY || 1;
  const px = (x: number) => pad + (x / (maxX || 1)) * (w - pad * 2);
  const py = (y: number) => h - pad - ((y - minY) / spanY) * (h - pad * 2);
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"} ${px(p.i)} ${py(p.cum)}`).join(" ");
  const zeroY = py(0);
  const last = points[points.length - 1];
  const color = last.cum >= 0 ? "#f59e0b" : "#fb7185";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-32 w-full">
      <defs>
        <linearGradient id="gsFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {zeroY > 0 && zeroY < h && (
        <line x1={pad} x2={w - pad} y1={zeroY} y2={zeroY} stroke="currentColor" strokeOpacity="0.15" strokeDasharray="3 3" />
      )}
      <path d={`${line} L ${px(last.i)} ${zeroY} L ${px(points[0].i)} ${zeroY} Z`} fill="url(#gsFill)" />
      <path d={line} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle key={i} cx={px(p.i)} cy={py(p.cum)} r={i === points.length - 1 ? 3 : 1.5} fill={color} />
      ))}
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

  const rows: Array<{ label: string; value: string | null | undefined }> = [
    { label: "Display name", value: user.fullName ?? user.username },
    { label: "Email", value: user.primaryEmailAddress?.emailAddress },
    { label: "User ID", value: user.id },
    { label: "Joined", value: user.createdAt?.toLocaleDateString() },
  ];

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
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
        <h2 className="mb-3 text-sm font-semibold text-foreground">Gamerscore over time</h2>
        <div className="rounded-lg border border-border bg-card p-4">
          <GamerscoreChart history={history} />
        </div>
      </div>

      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Game stats</h2>
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)} disabled={profileQ.isLoading}>
            View full profile
          </Button>
        </div>
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