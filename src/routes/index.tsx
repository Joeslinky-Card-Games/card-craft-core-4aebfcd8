import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto flex max-w-6xl flex-col items-center px-6 py-24 text-center">
        <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Online card games
        </span>
        <h1 className="mt-6 text-5xl font-bold tracking-tight text-foreground sm:text-6xl">
          ArcadiumX, <span className="text-primary">reimagined</span>.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
          Play Hearts, Spades, Poker and more with friends from anywhere. Create an
          account, pull up a chair, and deal.
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
            { title: "Classic games", body: "Hearts, Spades, Rummy, Poker — the games you already know." },
            { title: "Play with friends", body: "Private tables and quick matchmaking. No downloads." },
            { title: "Fair & secure", body: "Server-authoritative dealing. Your account is protected by Clerk." },
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
