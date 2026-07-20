import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { SuitsBackground } from "@/components/home/SuitsBackground";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ArcadiumX — Play Charlotte's Web & Stack Attack online" },
      {
        name: "description",
        content:
          "ArcadiumX is an online card game lounge. Play Charlotte's Web and Stack Attack with friends or solo against AI — no downloads.",
      },
      { property: "og:title", content: "ArcadiumX — Online card games" },
      {
        property: "og:description",
        content:
          "Play Charlotte's Web and Stack Attack with friends or solo against AI.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background">
      <SuitsBackground />
      <div className="relative z-10">
        <SiteHeader />
      </div>
      <main className="relative z-10 mx-auto flex max-w-6xl flex-col items-center px-6 py-24 text-center">
        <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Online card games
        </span>
        <h1 className="mt-6 text-5xl font-bold tracking-tight text-foreground sm:text-6xl">
          Your seat at the <span className="text-primary">table</span>.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
          Play Charlotte's Web and Stack Attack with friends from anywhere — or
          jump into a solo match against AI. Create an account, pull up a chair,
          and deal.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link
            to="/sign-up"
            className="inline-flex items-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            Get started
          </Link>
          <Link
            to="/lobby"
            className="inline-flex items-center rounded-md border border-input bg-background px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Browse games
          </Link>
        </div>

        <div className="mt-24 grid w-full grid-cols-1 gap-6 text-left sm:grid-cols-3">
          {[
            {
              title: "Distinct card games",
              body: "Charlotte's Web — a 13-round rummy variant with shifting wilds. Stack Attack — race to empty your stockpile. More games on the way.",
            },
            {
              title: "Friends or AI",
              body: "Share a 6-character table code to play with friends, or spin up a solo match against AI bots. Table chat included.",
            },
            {
              title: "Fair & secure",
              body: "Server-authoritative dealing, live leaderboards, and a gamerscore that tracks your progress over time.",
            },
          ].map((f) => (
            <div key={f.title} className="rounded-lg border border-border bg-card p-6">
              <h3 className="text-base font-semibold text-card-foreground">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
