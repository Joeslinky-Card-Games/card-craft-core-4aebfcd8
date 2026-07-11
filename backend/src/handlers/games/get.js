const { ok, notFound } = require("../../lib/response");
const { byId } = require("../../lib/games");

exports.handler = async (event) => {
  const gameId = event.pathParameters?.gameId;
  const game = byId(gameId);
  if (!game) return notFound("Game not found");
  return ok(game);
};