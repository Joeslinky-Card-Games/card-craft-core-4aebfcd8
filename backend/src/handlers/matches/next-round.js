const { GetCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, tables } = require("../../lib/dynamo");
const { ok, badRequest, notFound, forbidden, serverError } = require("../../lib/response");
const { withAuth } = require("../../lib/auth");
const engines = require("../../lib/engines");
const { withRefreshedTtl } = require("../../lib/matches");
const { recordMatchCompletion } = require("../../lib/stats");

exports.handler = withAuth(async (event, { userId }) => {
  const matchId = event.pathParameters?.matchId;
  try {
    const res = await ddb.send(new GetCommand({ TableName: tables.matches, Key: { matchId } }));
    if (!res.Item) return notFound();
    const match = res.Item;
    if (!Array.isArray(match.players) || !match.players.includes(userId)) {
      return forbidden("Not a player in this match");
    }
    if (match.status !== "round-complete") return badRequest("Round is not complete");

    const expectedVersion = match.version ?? 0;
    let next = engines.nextRound(match);
    next.version = expectedVersion + 1;
    next = withRefreshedTtl(next);
    const shouldRecordStats = next.status === "complete" && !match.statsRecorded;
    if (shouldRecordStats) next.statsRecorded = true;

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
    if (shouldRecordStats) await recordMatchCompletion(next);
    return ok(engines.redactForUser(next, userId));
  } catch (err) {
    console.error(err);
    return serverError();
  }
});