// Clerk publishable key. This is safe to expose in client code —
// it's the "publishable" (public) key, analogous to a Stripe pk_ key.
// Prefer VITE_CLERK_PUBLISHABLE_KEY from the environment (Vercel), fall back
// to the hard-coded production publishable key so the Lovable preview boots.
const FALLBACK_PUBLISHABLE_KEY = "pk_test_dHJ1c3R5LWdvYmJsZXItNS5jbGVyay5hY2NvdW50cy5kZXYk";
const publishableKey =
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || FALLBACK_PUBLISHABLE_KEY;

export const CLERK_PUBLISHABLE_KEY = publishableKey;
