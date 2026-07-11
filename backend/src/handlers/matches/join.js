const { badRequest } = require("../../lib/response");
const { withAuth } = require("../../lib/auth");
const { joinMatch } = require("../../lib/match-join");

// Join by matchId — used for rejoins from "Your tables" and internal lookups.
// Public join-by-code lives at POST /matches/join-by-code.
exports.handler = withAuth(async (event, { userId, claims }) => {
  const matchId = event.pathParameters?.matchId;
  let body = {};
  try { body = event.body ? JSON.parse(event.body) : {}; } catch { return badRequest("Invalid JSON"); }
  return joinMatch({ matchId, userId, claims, body });
});