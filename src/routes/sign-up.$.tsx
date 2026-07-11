import { createFileRoute } from "@tanstack/react-router";
import { SignUp } from "@clerk/tanstack-react-start";
import { SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/sign-up/$")({
  head: () => ({
    meta: [
      { title: "Sign up — ArcadiumX" },
      { name: "description", content: "Create your ArcadiumX account." },
    ],
  }),
  component: SignUpPage,
});

function SignUpPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="flex items-center justify-center px-6 py-16">
        <SignUp
          routing="path"
          path="/sign-up"
          signInUrl="/sign-in"
          fallbackRedirectUrl="/lobby"
        />
      </main>
    </div>
  );
}