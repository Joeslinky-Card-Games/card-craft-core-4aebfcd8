// Clerk publishable key. This is safe to expose in client code —
// it's the "publishable" (public) key, analogous to a Stripe pk_ key.
// Set VITE_CLERK_PUBLISHABLE_KEY in your environment (e.g. Vercel dashboard or .env.local).
const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!publishableKey) {
  throw new Error(
    "Missing VITE_CLERK_PUBLISHABLE_KEY. Add it to your environment variables (Vercel dashboard or .env.local)."
  );
}

export const CLERK_PUBLISHABLE_KEY = publishableKey;
