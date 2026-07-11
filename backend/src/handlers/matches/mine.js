const { ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, tables } = require("../../lib/dynamo");
const { ok, serverError } = require("../../lib/response");
const { withAuth } = require("../../lib/auth");
const { stripSecret } = require("../../lib/matches");

// Returns the caller's active (non-complete) matches so a player who
// accidentally left a table can rejoin without knowing the ID.
exports.handler = withAuth(async (_event, { userId }) => {
  try {
    const res = await ddb.send(
      new ScanCommand({
        TableName: tables.matches,
        FilterExpression: "contains(players, :uid) AND #s <> :complete",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":uid": userId, ":complete": "complete" },
      })
    );
    const items = (res.Items || [])
      .map(stripSecret)
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    return ok({ matches: items });
  } catch (err) {
    console.error(err);
    return serverError();
  }
});