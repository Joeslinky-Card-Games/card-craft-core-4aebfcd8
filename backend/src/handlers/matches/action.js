const { GetCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, tables } = require("../../lib/dynamo");
const { ok, badRequest, notFound, forbidden, serverError } = require("../../lib/response");
const { withAuth } = require("../../lib/auth");
const { applyAction } = require("../../lib/game/engine");
const { redactForUser } = require("../../lib/game/view");
const { withRefreshedTtl } = require("../../lib/matches");
const { recordMatchCompletion, recordRoundCompletion } = require("../../lib/stats");

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

    const nextWithTtl = withRefreshedTtl(next);
    const roundJustFinalized =
      (nextWithTtl.status === "round-complete" || nextWithTtl.status === "complete") &&
      (match.roundsRecordedThrough ?? 0) < nextWithTtl.round;
    if (roundJustFinalized) nextWithTtl.roundsRecordedThrough = nextWithTtl.round;
    const shouldRecordStats =
      nextWithTtl.status === "complete" && !match.statsRecorded;
    if (shouldRecordStats) nextWithTtl.statsRecorded = true;
    try {
      await ddb.send(
        new PutCommand({
          TableName: tables.matches,
          Item: nextWithTtl,
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
    if (roundJustFinalized) await recordRoundCompletion(nextWithTtl);
    if (shouldRecordStats) await recordMatchCompletion(nextWithTtl);
    return ok(redactForUser(nextWithTtl, userId));
  } catch (err) {
    console.error(err);
    return serverError();
  }
});