import { useUser } from "@clerk/tanstack-react-start";

/**
 * Resolve the best display name for the signed-in Clerk user.
 * Clerk's default session JWT doesn't include username / email, so the
 * backend can't derive this itself — the client sends it explicitly.
 */
export function useClerkIdentity(): { displayName?: string; avatarUrl?: string } {
  const { user } = useUser();
  if (!user) return {};
  const displayName =
    user.username ||
    user.fullName ||
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.primaryEmailAddress?.emailAddress ||
    undefined;
  const avatarUrl = user.imageUrl || undefined;
  return {
    displayName: displayName ? String(displayName).trim().slice(0, 64) || undefined : undefined,
    avatarUrl,
  };
}