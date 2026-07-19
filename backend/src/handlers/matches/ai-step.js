const { GetCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, tables } = require("../../lib/dynamo");
const { ok, badRequest, notFound, forbidden, serverError } = require("../../lib/response");
const { withAuth } = require("../../lib/auth");
const { applyAction, currentPlayer } = require("../../lib/game/engine");
const { chooseAction } = require("../../lib/game/ai");
const { redactForUser } = require("../../lib/game/view");
const { withRefreshedTtl } = require("../../lib/matches");
const { recordMatchCompletion } = require("../../lib/stats");

// Advances the match by ONE bot action if it's currently an AI's turn.
// The client polls this endpoint on a small delay to make bot play feel
// paced (draw → pause → discard → pause → next bot …) rather than teleporting.
exports.handler = withAuth(async (event, { userId }) => {
  const matchId = event.pathParameters?.matchId;
  try {
    const res = await ddb.send(new GetCommand({ TableName: tables.matches, Key: { matchId } }));
    if (!res.Item) return notFound();
    const match = res.Item;
    if (!Array.isArray(match.players) || !match.players.includes(userId)) {
      return forbidden("Not a player in this match");
    }
    if (match.status !== "in-progress") {
      return ok(redactForUser(match, userId));
    }
    const aiSet = new Set(Array.isArray(match.aiPlayers) ? match.aiPlayers : []);
    if (aiSet.size === 0) return ok(redactForUser(match, userId));
    const cp = currentPlayer(match);
    if (!aiSet.has(cp)) return ok(redactForUser(match, userId));

    const expectedVersion = match.version ?? 0;
    let next;
    try {
      const action = chooseAction(match, cp);
      next = applyAction(match, cp, action);
    } catch (err) {
      console.error("ai-step failed", err);
      return badRequest(err.message);
    }
    const nextWithTtl = withRefreshedTtl(next);
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
        // Someone else already advanced the state — return the current view.
        const fresh = await ddb.send(new GetCommand({ TableName: tables.matches, Key: { matchId } }));
        return ok(redactForUser(fresh.Item, userId));
      }
      throw err;
    }
    if (shouldRecordStats) await recordMatchCompletion(nextWithTtl);
    return ok(redactForUser(nextWithTtl, userId));
  } catch (err) {
    console.error(err);
    return serverError();
  }
});