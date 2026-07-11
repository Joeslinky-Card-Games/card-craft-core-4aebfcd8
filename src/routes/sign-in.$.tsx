import { createFileRoute } from "@tanstack/react-router";
import { SignIn } from "@clerk/tanstack-react-start";
import { SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/sign-in/$")({
  head: () => ({
    meta: [
      { title: "Sign in — ArcadiumX" },
      { name: "description", content: "Sign in to your ArcadiumX account." },
    ],
  }),
  component: SignInPage,
});

function SignInPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="flex items-center justify-center px-6 py-16">
        <SignIn
          routing="path"
          path="/sign-in"
          signUpUrl="/sign-up"
          fallbackRedirectUrl="/lobby"
        />
      </main>
    </div>
  );
}