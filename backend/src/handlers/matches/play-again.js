const { GetCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, tables } = require("../../lib/dynamo");
const { ok, badRequest, forbidden, notFound, serverError } = require("../../lib/response");
const { withAuth } = require("../../lib/auth");
const { withRefreshedTtl } = require("../../lib/matches");
const { redactForUser } = require("../../lib/game/view");

/**
 * "Play again" vote at the end of a completed match. Adds the caller to
 * match.playAgain; once every seated player has voted, resets the match to
 * a fresh lobby (status="open", zeroed scores, empty round state) so the
 * table can start a new game with the same players and code.
 */
exports.handler = withAuth(async (event, { userId }) => {
  const matchId = event.pathParameters?.matchId;
  if (!matchId) return badRequest("matchId required");

  try {
    const res = await ddb.send(new GetCommand({ TableName: tables.matches, Key: { matchId } }));
    if (!res.Item) return notFound();
    const match = res.Item;
    if (!Array.isArray(match.players) || !match.players.includes(userId)) {
      return forbidden("Not a player in this match");
    }
    if (match.status !== "complete") {
      return badRequest("Match is not complete");
    }
    const expectedVersion = match.version ?? 0;

    const votes = Array.isArray(match.playAgain) ? match.playAgain.slice() : [];
    if (!votes.includes(userId)) votes.push(userId);
    const allVoted = match.players.every((p) => votes.includes(p));

    let next;
    if (allVoted) {
      // Reset to a fresh lobby with the same seats, code, usernames, avatars.
      next = {
        matchId: match.matchId,
        code: match.code,
        gameId: match.gameId,
        status: "open",
        createdAt: new Date().toISOString(),
        createdBy: match.createdBy,
        players: match.players,
        usernames: match.usernames ?? {},
        avatars: match.avatars ?? {},
        maxPlayers: match.maxPlayers,
        minPlayers: match.minPlayers,
        visibility: match.visibility,
        ...(match.passwordHash ? { passwordHash: match.passwordHash } : {}),
        version: expectedVersion + 1,
        scores: Object.fromEntries(match.players.map((p) => [p, 0])),
        round: 0,
        playAgain: [],
        chatMessages: match.chatMessages ?? [],
      };
    } else {
      next = { ...match, playAgain: votes, version: expectedVersion + 1 };
    }

    const item = withRefreshedTtl(next);
    try {
      await ddb.send(new PutCommand({
        TableName: tables.matches,
        Item: item,
        ConditionExpression: "version = :v",
        ExpressionAttributeValues: { ":v": expectedVersion },
      }));
    } catch (err) {
      if (err.name === "ConditionalCheckFailedException") {
        return badRequest("Stale match state, please retry");
      }
      throw err;
    }
    return ok(redactForUser(item, userId));
  } catch (err) {
    console.error(err);
    return serverError();
  }
});