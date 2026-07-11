import { createFileRoute } from "@tanstack/react-router";
import { useUser } from "@clerk/tanstack-react-start";

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
        <div>
          <div className="text-lg font-semibold text-foreground">
            {user.fullName ?? user.username ?? "Player"}
          </div>
          <div className="text-sm text-muted-foreground">
            {user.primaryEmailAddress?.emailAddress}
          </div>
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

      <div className="mt-8 rounded-lg border border-dashed border-border bg-muted/40 p-5">
        <h2 className="text-sm font-semibold text-foreground">Game stats</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Coming soon — this will pull from the AWS backend (games played, win rate, ranking).
        </p>
      </div>
    </main>
  );
}