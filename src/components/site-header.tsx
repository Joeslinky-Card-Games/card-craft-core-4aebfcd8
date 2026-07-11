import { Link } from "@tanstack/react-router";
import {
  SignedIn,
  SignedOut,
  UserButton,
} from "@clerk/tanstack-react-start";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            ♠
          </span>
          <span>Card Table</span>
        </Link>

        <nav className="flex items-center gap-6 text-sm">
          <SignedIn>
            <Link
              to="/lobby"
              className="text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: "text-foreground" }}
            >
              Lobby
            </Link>
            <Link
              to="/profile"
              className="text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: "text-foreground" }}
            >
              Profile
            </Link>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
          <SignedOut>
            <Link
              to="/sign-in"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Sign in
            </Link>
            <Link
              to="/sign-up"
              className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Sign up
            </Link>
          </SignedOut>
        </nav>
      </div>
    </header>
  );
}