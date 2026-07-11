const { GetCommand, PutCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");
const { randomUUID } = require("crypto");
const { ddb, tables } = require("../../lib/dynamo");
const { ok, badRequest, forbidden, notFound, serverError } = require("../../lib/response");
const { withAuth } = require("../../lib/auth");
const { withRefreshedTtl, ttlForStatus } = require("../../lib/matches");
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
      // Start a brand-new match with the same seats, code, usernames, avatars.
      // A fresh matchId is allocated so the completed match row can be deleted
      // from the database — completed games shouldn't linger.
      const newMatchId = randomUUID();
      next = {
        matchId: newMatchId,
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
        version: 0,
        scores: Object.fromEntries(match.players.map((p) => [p, 0])),
        round: 0,
        playAgain: [],
        chatMessages: match.chatMessages ?? [],
      };
    } else {
      next = { ...match, playAgain: votes, version: expectedVersion + 1 };
    }

    const item = withRefreshedTtl(next);
    if (allVoted) {
      // Write the fresh match first, then repoint the short-code and delete
      // the old match row. Order matters so we never orphan the code.
      await ddb.send(new PutCommand({
        TableName: tables.matches,
        Item: item,
        ConditionExpression: "attribute_not_exists(matchId)",
      }));
      if (match.code) {
        await ddb.send(new PutCommand({
          TableName: tables.matchCodes,
          Item: {
            code: match.code,
            matchId: item.matchId,
            createdAt: new Date().toISOString(),
            ttl: ttlForStatus("open"),
          },
        }));
      }
      await ddb.send(new DeleteCommand({
        TableName: tables.matches,
        Key: { matchId: match.matchId },
      }));
    } else {
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
    }
    return ok(redactForUser(item, userId));
  } catch (err) {
    console.error(err);
    return serverError();
  }
});