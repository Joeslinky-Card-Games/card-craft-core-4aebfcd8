const { GetCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, tables } = require("../../lib/dynamo");
const { ok, badRequest, notFound, forbidden, serverError } = require("../../lib/response");
const { withAuth } = require("../../lib/auth");
const engines = require("../../lib/engines");
const { withRefreshedTtl } = require("../../lib/matches");

exports.handler = withAuth(async (event, { userId }) => {
  const matchId = event.pathParameters?.matchId;
  try {
    const res = await ddb.send(new GetCommand({ TableName: tables.matches, Key: { matchId } }));
    if (!res.Item) return notFound();
    const match = res.Item;
    if (match.createdBy !== userId) return forbidden("Only the creator can start the match");
    if (match.status !== "open") return badRequest("Match is not open");
    const minPlayers = match.minPlayers ?? 2;
    if (match.players.length < minPlayers) return badRequest(`Need at least ${minPlayers} players`);

    const expectedVersion = match.version ?? 0;
    const base = engines.startMatch(match.gameId, { matchId: match.matchId, players: match.players });
    const dealt = engines.startRound(match.gameId, base, 1);
    // Preserve lobby metadata + bump version.
    let next = {
      ...match,
      ...dealt,
      version: expectedVersion + 1,
      startedAt: match.startedAt || new Date().toISOString(),
    };
    next = withRefreshedTtl(next);

    try {
      await ddb.send(
        new PutCommand({
          TableName: tables.matches,
          Item: next,
          ConditionExpression: "version = :v AND #s = :open",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: { ":v": expectedVersion, ":open": "open" },
        })
      );
    } catch (err) {
      if (err.name === "ConditionalCheckFailedException") {
        return badRequest("Match already started or state changed");
      }
      throw err;
    }
    return ok(engines.redactForUser(next, userId));
  } catch (err) {
    console.error(err);
    return serverError();
  }
});