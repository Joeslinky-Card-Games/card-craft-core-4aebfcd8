const { UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, tables } = require("../../lib/dynamo");
const { ok, badRequest, serverError } = require("../../lib/response");
const { withAuth } = require("../../lib/auth");

// Stubbed: appends an action to the match's action log. Real game rules
// go here (or in a per-game module) once game logic is designed.
exports.handler = withAuth(async (event, { userId }) => {
  const matchId = event.pathParameters?.matchId;
  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return badRequest("Invalid JSON"); }
  const action = { userId, type: body.type, payload: body.payload ?? null, at: new Date().toISOString() };
  try {
    const res = await ddb.send(
      new UpdateCommand({
        TableName: tables.matches,
        Key: { matchId },
        ConditionExpression: "attribute_exists(matchId) AND contains(players, :uid)",
        UpdateExpression: "SET actions = list_append(if_not_exists(actions, :empty), :a)",
        ExpressionAttributeValues: { ":uid": userId, ":a": [action], ":empty": [] },
        ReturnValues: "ALL_NEW",
      })
    );
    return ok(res.Attributes);
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") return badRequest("Not a player in this match");
    console.error(err);
    return serverError();
  }
});