const { UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, tables } = require("./dynamo");

function isHuman(playerId) {
  return typeof playerId === "string" && !playerId.startsWith("ai-");
}

function usernameFor(userId, usernames) {
  return String(usernames?.[userId] || `player-${String(userId).slice(-4)}`).slice(0, 64);
}

// Record a single completed round: everyone at the table gets +1 roundsPlayed,
// the player who went out gets +1 roundsWon. `rating` mirrors roundsWon so
// the byGame GSI orders leaderboard rows by rounds won.
async function recordRoundCompletion(match) {
  if (!match) return;
  const gameId = match.gameId;
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
            "ADD roundsPlayed :one, roundsWon :won, rating :won SET username = :name, updatedAt = :now",
          ExpressionAttributeValues: {
            ":one": 1,
            ":won": won,
            ":name": usernameFor(userId, usernames),
            ":now": new Date().toISOString(),
          },
        })
      ).catch((err) => {
        console.error("round stats update failed", { userId, gameId, err });
      });
    })
  );
}

// Called exactly once per completed match (guarded by match.statsRecorded).
async function recordMatchCompletion(match) {
  if (!match || match.status !== "complete") return;
  const gameId = match.gameId;
  const winner = match.winner;
  const usernames = match.usernames || {};
  const humans = (match.players || []).filter(isHuman);
  await Promise.all(
    humans.map((userId) => {
      const won = userId === winner ? 1 : 0;
      return ddb.send(
        new UpdateCommand({
          TableName: tables.stats,
          Key: { userId, gameId },
          UpdateExpression:
            "ADD gamesPlayed :one, gamesWon :won SET username = :name, updatedAt = :now",
          ExpressionAttributeValues: {
            ":one": 1,
            ":won": won,
            ":name": usernameFor(userId, usernames),
            ":now": new Date().toISOString(),
          },
        })
      ).catch((err) => {
        console.error("match stats update failed", { userId, gameId, err });
      });
    })
  );
}

module.exports = { recordMatchCompletion, recordRoundCompletion };
