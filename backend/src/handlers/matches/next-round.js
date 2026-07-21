const { GetCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, tables } = require("../../lib/dynamo");
const { ok, badRequest, notFound, forbidden, serverError } = require("../../lib/response");
const { withAuth } = require("../../lib/auth");
const engines = require("../../lib/engines");
const { withRefreshedTtl } = require("../../lib/matches");
const { recordMatchCompletion } = require("../../lib/stats");
const { recordCompletedMatch } = require("../../lib/runtime-stats");

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

    // Ready-up voting: every human player must click "Ready" before the
    // round summary dismisses and the next round deals. AI players are
    // considered ready automatically.
    const aiSet = new Set(Array.isArray(match.aiPlayers) ? match.aiPlayers : []);
    const humans = match.players.filter((p) => !aiSet.has(p));
    const ready = Array.isArray(match.readyNextRound) ? match.readyNextRound.slice() : [];
    if (!ready.includes(userId)) ready.push(userId);
    const allReady = humans.every((p) => ready.includes(p));

    let next;
    if (!allReady) {
      next = withRefreshedTtl({
        ...match,
        readyNextRound: ready,
        version: expectedVersion + 1,
      });
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
      return ok(engines.redactForUser(next, userId));
    }

    next = engines.nextRound(match);
    next.version = expectedVersion + 1;
    next.readyNextRound = [];
    next = withRefreshedTtl(next);
    const shouldRecordStats = next.status === "complete" && !match.statsRecorded;
    if (shouldRecordStats) next.statsRecorded = true;
    if (next.status === "complete" && !next.completedAt) {
      next.completedAt = new Date().toISOString();
    }
    const shouldRecordRuntime =
      next.status === "complete" && !match.runtimeRecorded;
    if (shouldRecordRuntime) next.runtimeRecorded = true;

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
    if (shouldRecordRuntime) await recordCompletedMatch(next);
    return ok(engines.redactForUser(next, userId));
  } catch (err) {
    console.error(err);
    return serverError();
  }
});