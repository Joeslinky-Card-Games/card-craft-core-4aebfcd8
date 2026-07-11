const { UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, tables } = require("../../lib/dynamo");
const { ok, badRequest, serverError } = require("../../lib/response");
const { withAuth } = require("../../lib/auth");

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
  const matchId = event.pathParameters?.matchId;
  const name = displayName(userId, claims);
  const avatar = avatarUrl(claims);
  try {
    const res = await ddb.send(
      new UpdateCommand({
        TableName: tables.matches,
        Key: { matchId },
        ConditionExpression: "attribute_exists(matchId) AND #s = :open AND size(players) < maxPlayers AND NOT contains(players, :uid)",
        UpdateExpression:
          "SET players = list_append(players, :p), usernames.#uid = :name, avatars = if_not_exists(avatars, :emptyMap)" +
          (avatar ? ", avatars.#uid = :avatar" : "") +
          " ADD version :one",
        ExpressionAttributeNames: { "#s": "status", "#uid": userId },
        ExpressionAttributeValues: {
          ":open": "open",
          ":uid": userId,
          ":p": [userId],
          ":one": 1,
          ":name": name,
          ":emptyMap": {},
          ...(avatar ? { ":avatar": avatar } : {}),
        },
        ReturnValues: "ALL_NEW",
      })
    );
    return ok(res.Attributes);
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") return badRequest("Cannot join match");
    console.error(err);
    return serverError();
  }
});