const { UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, tables } = require("./dynamo");

function isHuman(playerId) {
  return typeof playerId === "string" && !playerId.startsWith("ai-");
}

// Called exactly once per completed match (guarded by match.statsRecorded).
// Increments gamesPlayed for every human seated, gamesWon for the winner,
// and stores the display name so the leaderboard can render without an
// extra Users lookup. `rating` mirrors gamesWon so the byGame GSI sorts
// leaderboard results by wins.
async function recordMatchCompletion(match) {
  if (!match || match.status !== "complete") return;
  const gameId = match.gameId;
  const winner = match.winner;
  const usernames = match.usernames || {};
  const humans = (match.players || []).filter(isHuman);
  await Promise.all(
    humans.map((userId) => {
      const won = userId === winner ? 1 : 0;
      const username = String(usernames[userId] || `player-${userId.slice(-4)}`).slice(0, 64);
      return ddb.send(
        new UpdateCommand({
          TableName: tables.stats,
          Key: { userId, gameId },
          UpdateExpression:
            "ADD gamesPlayed :one, gamesWon :won, rating :won SET username = :name, updatedAt = :now",
          ExpressionAttributeValues: {
            ":one": 1,
            ":won": won,
            ":name": username,
            ":now": new Date().toISOString(),
          },
        })
      ).catch((err) => {
        console.error("stats update failed", { userId, gameId, err });
      });
    })
  );
}

module.exports = { recordMatchCompletion };
