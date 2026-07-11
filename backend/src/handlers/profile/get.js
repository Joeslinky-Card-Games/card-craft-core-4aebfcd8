const { GetCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, tables } = require("../../lib/dynamo");
const { ok, serverError } = require("../../lib/response");
const { withAuth } = require("../../lib/auth");

exports.handler = withAuth(async (_event, { userId, claims }) => {
  try {
    const res = await ddb.send(new GetCommand({ TableName: tables.users, Key: { userId } }));
    if (res.Item) return ok(res.Item);

    const profile = {
      userId,
      username: claims.username || claims.email || `player-${userId.slice(-6)}`,
      createdAt: new Date().toISOString(),
    };
    await ddb.send(new PutCommand({ TableName: tables.users, Item: profile }));
    return ok(profile);
  } catch (err) {
    console.error(err);
    return serverError();
  }
});