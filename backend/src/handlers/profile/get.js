const { GetCommand, PutCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, tables } = require("../../lib/dynamo");
const { ok, serverError } = require("../../lib/response");
const { withAuth } = require("../../lib/auth");

exports.handler = withAuth(async (_event, { userId, claims }) => {
  try {
    const res = await ddb.send(new GetCommand({ TableName: tables.users, Key: { userId } }));
    const now = new Date().toISOString();
    if (res.Item) {
      // Heartbeat so profile pages can show a meaningful "last online" time.
      ddb
        .send(
          new UpdateCommand({
            TableName: tables.users,
            Key: { userId },
            UpdateExpression: "SET lastActiveAt = :t",
            ExpressionAttributeValues: { ":t": now },
          })
        )
        .catch((err) => console.warn("lastActiveAt update failed", err.message));
      return ok({ ...res.Item, lastActiveAt: now });
    }

    const profile = {
      userId,
      username: claims.username || claims.email || `player-${userId.slice(-6)}`,
      createdAt: now,
      lastActiveAt: now,
    };
    await ddb.send(new PutCommand({ TableName: tables.users, Item: profile }));
    return ok(profile);
  } catch (err) {
    console.error(err);
    return serverError();
  }
});