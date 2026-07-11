const { UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, tables } = require("../../lib/dynamo");
const { ok, badRequest, serverError } = require("../../lib/response");
const { withAuth } = require("../../lib/auth");

exports.handler = withAuth(async (event, { userId }) => {
  const matchId = event.pathParameters?.matchId;
  try {
    const res = await ddb.send(
      new UpdateCommand({
        TableName: tables.matches,
        Key: { matchId },
        ConditionExpression: "attribute_exists(matchId) AND #s = :open AND size(players) < maxPlayers AND NOT contains(players, :uid)",
        UpdateExpression: "SET players = list_append(players, :p)",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":open": "open", ":uid": userId, ":p": [userId] },
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