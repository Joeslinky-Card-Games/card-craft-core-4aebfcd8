const { ok, badRequest, serverError } = require("../../lib/response");
const { getRuntimeStats } = require("../../lib/runtime-stats");

exports.handler = async (event) => {
  const gameId = event.pathParameters?.gameId;
  if (!gameId) return badRequest("gameId required");
  try {
    const stats = await getRuntimeStats(gameId);
    return ok(stats);
  } catch (err) {
    console.error("runtime stats failed", err);
    return serverError();
  }
};