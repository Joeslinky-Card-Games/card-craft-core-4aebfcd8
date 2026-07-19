const { GetCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, tables } = require("./dynamo");

const CANONICAL_GAME_IDS = {
  rummy: "charlottes-web",
};

function isHuman(playerId) {
  return typeof playerId === "string" && !playerId.startsWith("ai-");
}

function usernameFor(userId, usernames) {
  return String(usernames?.[userId] || `player-${String(userId).slice(-4)}`).slice(0, 64);
}

function gameIdForStats(match) {
  const raw = typeof match?.gameId === "string" && match.gameId ? match.gameId : "charlottes-web";
  return CANONICAL_GAME_IDS[raw] || raw;
}

// Record a single completed round: everyone at the table gets +1 roundsPlayed,
// the player who went out gets +1 roundsWon. `rating` mirrors roundsWon so
// the byGame GSI orders leaderboard rows by rounds won.
async function recordRoundCompletion(match) {
  if (!match) return;
  const gameId = gameIdForStats(match);
  const usernames = match.usernames || {};
  const humans = (match.players || []).filter(isHuman);
  const winner = match.goneOutBy;
  await Promise.all(
    humans.map((userId) => {
      const won = userId === winner ? 1 : 0;
      return ddb.send(
        new UpdateCommand({
          TableName: tables.stats,
          Key: { userId, gameId },
          UpdateExpression:
            "SET roundsPlayed = if_not_exists(roundsPlayed, :zero) + :one, roundsWon = if_not_exists(roundsWon, :zero) + :won, rating = if_not_exists(rating, :zero) + :won, username = :name, updatedAt = :now",
          ExpressionAttributeValues: {
            ":zero": 0,
            ":one": 1,
            ":won": won,
            ":name": usernameFor(userId, usernames),
            ":now": new Date().toISOString(),
          },
        })
      );
    })
  );
}

// Backfill helper: credit every human in the match with `roundsPlayed`
// increments equal to the total rounds actually played, and +1 roundsWon
// for the final-round winner (per-round history isn't persisted, so
// earlier round winners can't be reconstructed).
async function recordRoundsBackfill(match, rounds) {
  if (!match || !rounds || rounds <= 0) return;
  const gameId = gameIdForStats(match);
  const usernames = match.usernames || {};
  const humans = (match.players || []).filter(isHuman);
  const winner = match.goneOutBy;
  await Promise.all(
    humans.map((userId) => {
      const won = userId === winner ? 1 : 0;
      return ddb.send(
        new UpdateCommand({
          TableName: tables.stats,
          Key: { userId, gameId },
          UpdateExpression:
            "SET roundsPlayed = if_not_exists(roundsPlayed, :zero) + :rounds, roundsWon = if_not_exists(roundsWon, :zero) + :won, rating = if_not_exists(rating, :zero) + :won, username = :name, updatedAt = :now",
          ExpressionAttributeValues: {
            ":zero": 0,
            ":rounds": rounds,
            ":won": won,
            ":name": usernameFor(userId, usernames),
            ":now": new Date().toISOString(),
          },
        })
      );
    })
  );
}

// Idempotent repair/backfill helper. It raises a leaderboard row to at least
// the totals reconstructed from match records without decrementing any live
// stats that may already include deleted/expired matches.
async function raiseStatsToFloor(userId, gameId, totals, username) {
  if (!userId || !gameId || !totals) return null;
  const currentRes = await ddb.send(
    new GetCommand({ TableName: tables.stats, Key: { userId, gameId } })
  );
  const current = currentRes.Item || {};
  const currentRoundsPlayed = Number(current.roundsPlayed || 0);
  const currentRoundsWon = Number(current.roundsWon || 0);
  const currentGamesPlayed = Number(current.gamesPlayed || 0);
  const currentGamesWon = Number(current.gamesWon || 0);
  const currentRating = Number(current.rating || current.roundsWon || 0);

  const roundsPlayedDelta = Math.max(0, Number(totals.roundsPlayed || 0) - currentRoundsPlayed);
  const roundsWonDelta = Math.max(0, Number(totals.roundsWon || 0) - currentRoundsWon);
  const gamesPlayedDelta = Math.max(0, Number(totals.gamesPlayed || 0) - currentGamesPlayed);
  const gamesWonDelta = Math.max(0, Number(totals.gamesWon || 0) - currentGamesWon);
  const ratingDelta = Math.max(0, Number(totals.roundsWon || 0) - currentRating);

  await ddb.send(
    new UpdateCommand({
      TableName: tables.stats,
      Key: { userId, gameId },
      UpdateExpression:
        "SET roundsPlayed = if_not_exists(roundsPlayed, :zero) + :roundsPlayedDelta, roundsWon = if_not_exists(roundsWon, :zero) + :roundsWonDelta, gamesPlayed = if_not_exists(gamesPlayed, :zero) + :gamesPlayedDelta, gamesWon = if_not_exists(gamesWon, :zero) + :gamesWonDelta, rating = if_not_exists(rating, :zero) + :ratingDelta, username = :name, updatedAt = :now",
      ExpressionAttributeValues: {
        ":zero": 0,
        ":roundsPlayedDelta": roundsPlayedDelta,
        ":roundsWonDelta": roundsWonDelta,
        ":gamesPlayedDelta": gamesPlayedDelta,
        ":gamesWonDelta": gamesWonDelta,
        ":ratingDelta": ratingDelta,
        ":name": username || String(userId).slice(-12),
        ":now": new Date().toISOString(),
      },
    })
  );

  return {
    userId,
    gameId,
    roundsPlayedDelta,
    roundsWonDelta,
    gamesPlayedDelta,
    gamesWonDelta,
  };
}

// Called exactly once per completed match (guarded by match.statsRecorded).
async function recordMatchCompletion(match) {
  if (!match || match.status !== "complete") return;
  const gameId = gameIdForStats(match);
  const winner = match.winner;
  const usernames = match.usernames || {};
  const humans = (match.players || []).filter(isHuman);
  const scores = match.scores || {};
  await Promise.all(
    humans.map((userId) => {
      const won = userId === winner ? 1 : 0;
      const points = Number(scores[userId] || 0);
      return ddb.send(
        new UpdateCommand({
          TableName: tables.stats,
          Key: { userId, gameId },
          UpdateExpression:
            "SET gamesPlayed = if_not_exists(gamesPlayed, :zero) + :one, gamesWon = if_not_exists(gamesWon, :zero) + :won, totalPoints = if_not_exists(totalPoints, :zero) + :points, rating = if_not_exists(rating, :zero), username = :name, updatedAt = :now",
          ExpressionAttributeValues: {
            ":zero": 0,
            ":one": 1,
            ":won": won,
            ":points": points,
            ":name": usernameFor(userId, usernames),
            ":now": new Date().toISOString(),
          },
        })
      );
    })
  );
}

module.exports = {
  recordMatchCompletion,
  recordRoundCompletion,
  recordRoundsBackfill,
  raiseStatsToFloor,
  gameIdForStats,
};
