const { PutCommand } = require("@aws-sdk/lib-dynamodb");
const { randomUUID } = require("crypto");
const { ddb, tables } = require("../../lib/dynamo");
const { created, badRequest, serverError } = require("../../lib/response");
const { withAuth } = require("../../lib/auth");
const { byId } = require("../../lib/games");
const { hashPassword, stripSecret, validatePassword } = require("../../lib/matches");

function displayName(userId, claims) {
  return (
    claims?.username ||
    claims?.preferred_username ||
    claims?.name ||
    claims?.email ||
    `player-${String(userId).slice(-4)}`
  );
}

function avatarUrl(claims) {
  return claims?.picture || claims?.image_url || claims?.imageUrl || null;
}

exports.handler = withAuth(async (event, { userId, claims }) => {
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

  const visibility = body.visibility === "private" ? "private" : "public";
  let passwordHash;
  if (visibility === "private") {
    const err = validatePassword(body.password);
    if (err) return badRequest(err);
    passwordHash = hashPassword(String(body.password).trim());
  }

  const match = {
    matchId: randomUUID(),
    gameId,
    status: "open",
    createdAt: new Date().toISOString(),
    createdBy: userId,
    players: [userId],
    usernames: { [userId]: displayName(userId, claims) },
    avatars: avatarUrl(claims) ? { [userId]: avatarUrl(claims) } : {},
    maxPlayers,
    minPlayers: game.minPlayers,
    version: 0,
    visibility,
    ...(passwordHash ? { passwordHash } : {}),
  };
  try {
    await ddb.send(new PutCommand({ TableName: tables.matches, Item: match }));
    return created(stripSecret(match));
  } catch (err) {
    console.error(err);
    return serverError();
  }
});