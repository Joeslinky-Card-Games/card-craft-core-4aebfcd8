import {
  createFileRoute,
  Outlet,
  useNavigate,
} from "@tanstack/react-router";
import { useAuth, ClerkLoaded, ClerkLoading } from "@clerk/tanstack-react-start";
import { useEffect } from "react";
import { SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />
      <ClerkLoading>
        <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
          Loading…
        </div>
      </ClerkLoading>
      <ClerkLoaded>
        <AuthGate />
      </ClerkLoaded>
    </div>
  );
}

function AuthGate() {
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isSignedIn === false) {
      navigate({ to: "/sign-in/$", params: { _splat: "" }, replace: true });
    }
  }, [isSignedIn, navigate]);

  if (!isSignedIn) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        Redirecting to sign in…
      </div>
    );
  }

  return <Outlet />;
}