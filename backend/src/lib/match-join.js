const { GetCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, tables } = require("./dynamo");
const { ok, badRequest, unauthorized, notFound, serverError } = require("./response");
const { hashPassword, stripSecret, ttlForStatus } = require("./matches");

function sanitizeName(v) {
  if (typeof v !== "string") return null;
  const s = v.trim().slice(0, 64);
  return s || null;
}

function displayNameFor(userId, claims, body) {
  return (
    sanitizeName(body?.displayName) ||
    claims?.username ||
    claims?.preferred_username ||
    claims?.name ||
    claims?.email ||
    `player-${String(userId).slice(-4)}`
  );
}

function avatarUrlFor(claims, body) {
  const fromBody = typeof body?.avatarUrl === "string" ? body.avatarUrl.trim() : "";
  if (fromBody && /^https?:\/\//i.test(fromBody)) return fromBody.slice(0, 512);
  return claims?.picture || claims?.image_url || claims?.imageUrl || null;
}

/**
 * Shared join logic used by both `POST /matches/{matchId}/join` (rejoins /
 * legacy id-based) and `POST /matches/join-by-code`.
 * Returns an API Gateway response object.
 */
async function joinMatch({ matchId, userId, claims, body }) {
  if (!matchId) return notFound("Table not found");
  const name = displayNameFor(userId, claims, body);
  const avatar = avatarUrlFor(claims, body);

  try {
    const existing = await ddb.send(new GetCommand({ TableName: tables.matches, Key: { matchId } }));
    if (!existing.Item) return notFound("Table not found");
    const match = existing.Item;

    if (match.visibility === "private") {
      const pw = typeof body?.password === "string" ? body.password.trim() : "";
      if (!pw) return unauthorized("Password required");
      if (hashPassword(pw) !== match.passwordHash) return unauthorized("Incorrect password");
    }

    if (Array.isArray(match.players) && match.players.includes(userId)) {
      return ok(stripSecret(match));
    }

    const res = await ddb.send(
      new UpdateCommand({
        TableName: tables.matches,
        Key: { matchId },
        ConditionExpression:
          "attribute_exists(matchId) AND #s = :open AND size(players) < maxPlayers AND NOT contains(players, :uid)",
        UpdateExpression:
          "SET players = list_append(players, :p), usernames.#uid = :name, #ttl = :ttl" +
          (avatar ? ", avatars.#uid = :avatar" : "") +
          " ADD version :one",
        ExpressionAttributeNames: { "#s": "status", "#uid": userId, "#ttl": "ttl" },
        ExpressionAttributeValues: {
          ":open": "open",
          ":uid": userId,
          ":p": [userId],
          ":one": 1,
          ":name": name,
          ":ttl": ttlForStatus("open"),
          ...(avatar ? { ":avatar": avatar } : {}),
        },
        ReturnValues: "ALL_NEW",
      })
    );
    return ok(stripSecret(res.Attributes));
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") return badRequest("Cannot join match");
    console.error(err);
    return serverError();
  }
}

module.exports = { joinMatch };