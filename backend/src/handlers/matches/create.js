const { PutCommand } = require("@aws-sdk/lib-dynamodb");
const { randomUUID } = require("crypto");
const { ddb, tables } = require("../../lib/dynamo");
const { created, badRequest, serverError } = require("../../lib/response");
const { withAuth } = require("../../lib/auth");
const { byId } = require("../../lib/games");

exports.handler = withAuth(async (event, { userId }) => {
  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return badRequest("Invalid JSON"); }
  const gameId = body.gameId;
  const game = byId(gameId);
  if (!game) return badRequest("Unknown gameId");
  if (game.status !== "available") return badRequest("Game not yet available");

  const requestedMax = Number(body.maxPlayers);
  const maxPlayers = Number.isInteger(requestedMax)
    ? Math.max(game.minPlayers, Math.min(game.maxPlayers, requestedMax))
    : game.maxPlayers;

  const match = {
    matchId: randomUUID(),
    gameId,
    status: "open",
    createdAt: new Date().toISOString(),
    createdBy: userId,
    players: [userId],
    maxPlayers,
    minPlayers: game.minPlayers,
    version: 0,
  };
  try {
    await ddb.send(new PutCommand({ TableName: tables.matches, Item: match }));
    return created(match);
  } catch (err) {
    console.error(err);
    return serverError();
  }
});