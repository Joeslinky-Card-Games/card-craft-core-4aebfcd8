const { createRemoteJWKSet, jwtVerify } = require("jose");

let jwks;
const getJwks = () => {
  if (!jwks) {
    const issuer = process.env.CLERK_ISSUER;
    if (!issuer) throw new Error("CLERK_ISSUER not configured");
    jwks = createRemoteJWKSet(new URL(`${issuer.replace(/\/$/, "")}/.well-known/jwks.json`));
  }
  return jwks;
};

/**
 * Verify a Clerk-issued JWT from the Authorization header.
 * Returns { userId, claims } on success, throws on failure.
 */
async function verifyAuth(event) {
  const header =
    event.headers?.authorization || event.headers?.Authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new Error("Missing bearer token");

  const { payload } = await jwtVerify(token, getJwks(), {
    issuer: process.env.CLERK_ISSUER,
    audience: process.env.CLERK_AUDIENCE || undefined,
  });

  if (!payload.sub) throw new Error("Token missing sub");
  return { userId: payload.sub, claims: payload };
}

/** Wrap a handler that requires auth. Injects { userId, claims } as second arg. */
const withAuth = (handler) => async (event) => {
  const { unauthorized } = require("./response");
  try {
    const auth = await verifyAuth(event);
    return handler(event, auth);
  } catch (err) {
    console.warn("auth failed:", err.message);
    return unauthorized(err.message);
  }
};

module.exports = { verifyAuth, withAuth };