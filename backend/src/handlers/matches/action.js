const { GetCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, tables } = require("../../lib/dynamo");
const { ok, badRequest, notFound, forbidden, serverError } = require("../../lib/response");
const { withAuth } = require("../../lib/auth");
const { applyAction } = require("../../lib/game/engine");
const { redactForUser } = require("../../lib/game/view");

exports.handler = withAuth(async (event, { userId }) => {
  const matchId = event.pathParameters?.matchId;
  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return badRequest("Invalid JSON"); }
  if (!body || typeof body.type !== "string") return badRequest("Missing action.type");

  try {
    const res = await ddb.send(new GetCommand({ TableName: tables.matches, Key: { matchId } }));
    if (!res.Item) return notFound();
    const match = res.Item;
    if (!Array.isArray(match.players) || !match.players.includes(userId)) {
      return forbidden("Not a player in this match");
    }
    const expectedVersion = match.version ?? 0;

    let next;
    try {
      next = applyAction(match, userId, body);
    } catch (err) {
      return badRequest(err.message);
    }

    try {
      await ddb.send(
        new PutCommand({
          TableName: tables.matches,
          Item: next,
          ConditionExpression: "version = :v",
          ExpressionAttributeValues: { ":v": expectedVersion },
        })
      );
    } catch (err) {
      if (err.name === "ConditionalCheckFailedException") {
        return badRequest("Stale match state, please retry");
      }
      throw err;
    }
    return ok(redactForUser(next, userId));
  } catch (err) {
    console.error(err);
    return serverError();
  }
});