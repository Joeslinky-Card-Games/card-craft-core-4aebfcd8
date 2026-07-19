const { ScanCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, tables } = require("../../lib/dynamo");
const { ok, serverError } = require("../../lib/response");
const { withAuth } = require("../../lib/auth");
const { gameIdForStats, raiseStatsToFloor, recordRoundsBackfill, recordMatchCompletion } = require("../../lib/stats");
const { recordCompletedMatch } = require("../../lib/runtime-stats");

function isHuman(playerId) {
  return typeof playerId === "string" && !playerId.startsWith("ai-");
}

function usernameFor(userId, usernames) {
  return String(usernames?.[userId] || `player-${String(userId).slice(-4)}`).slice(0, 64);
}

function addTotals(totalsByUser, match) {
  const gameId = gameIdForStats(match);
  const usernames = match.usernames || {};
  const humans = Array.isArray(match.players) ? match.players.filter(isHuman) : [];
  const round = Number(match.round || 0);
  const roundIsOver = match.status === "round-complete" || match.status === "complete";
  const roundsPlayed = roundIsOver && round > 0 ? round : Math.max(0, round - 1);
  const roundWinner = match.goneOutBy;
  const matchIsOver = match.status === "complete";
  const matchWinner = match.winner;
  const matchScores = match.scores || {};

  for (const userId of humans) {
    const key = `${gameId}\u0000${userId}`;
    const totals = totalsByUser.get(key) || {
      userId,
      gameId,
      username: usernameFor(userId, usernames),
      roundsPlayed: 0,
      roundsWon: 0,
      gamesPlayed: 0,
      gamesWon: 0,
      totalPoints: 0,
    };
    totals.username = usernameFor(userId, usernames) || totals.username;
    totals.roundsPlayed += roundsPlayed;
    totals.roundsWon += roundWinner === userId ? 1 : 0;
    totals.gamesPlayed += matchIsOver ? 1 : 0;
    totals.gamesWon += matchIsOver && matchWinner === userId ? 1 : 0;
    totals.totalPoints += matchIsOver ? Number(matchScores[userId] || 0) : 0;
    totalsByUser.set(key, totals);
  }
}

// One-shot backfill for historical matches whose stats were never recorded.
// Idempotent: skips matches already flagged. Any authenticated user may call
// it (writes only advance counters and set flags — cannot decrement).
exports.handler = withAuth(async () => {
  try {
    let scanned = 0;
    let roundsBackfilled = 0;
    let matchesBackfilled = 0;
    const details = [];
    const totalsByUser = new Map();
    let ExclusiveStartKey;
    do {
      const res = await ddb.send(new ScanCommand({
        TableName: tables.matches,
        ExclusiveStartKey,
      }));
      for (const match of res.Items || []) {
        scanned++;
        addTotals(totalsByUser, match);
        const round = Number(match.round || 0);
        const recordedThrough = Number(match.roundsRecordedThrough || 0);
        const roundIsOver = match.status === "round-complete" || match.status === "complete";
        const matchIsOver = match.status === "complete";
        const missingRounds = roundIsOver && round > 0 ? Math.max(0, round - recordedThrough) : 0;
        const isRoundDone = missingRounds > 0;
        const isMatchDone = matchIsOver && !match.statsRecorded;
        if (!isRoundDone && !isMatchDone) {
          details.push({
            matchId: match.matchId,
            status: match.status,
            round,
            recordedThrough,
            skipped: true,
          });
          continue;
        }

        if (isRoundDone) {
          await recordRoundsBackfill(match, missingRounds);
          match.roundsRecordedThrough = round;
          roundsBackfilled += missingRounds;
        }
        if (isMatchDone) {
          await recordMatchCompletion(match);
          match.statsRecorded = true;
          matchesBackfilled++;
        }
        if (match.status === "complete" && !match.runtimeRecorded && match.startedAt && match.completedAt) {
          const recorded = await recordCompletedMatch(match);
          if (recorded) match.runtimeRecorded = true;
        }
        await ddb.send(new PutCommand({ TableName: tables.matches, Item: match }));
        details.push({
          matchId: match.matchId,
          status: match.status,
          round,
          recordedThrough,
          missingRounds,
          recordedRound: isRoundDone,
          recordedMatch: isMatchDone,
        });
      }
      ExclusiveStartKey = res.LastEvaluatedKey;
    } while (ExclusiveStartKey);

    const repaired = [];
    let statRowsRepaired = 0;
    for (const totals of totalsByUser.values()) {
      const result = await raiseStatsToFloor(totals.userId, totals.gameId, totals, totals.username);
      if (!result) continue;
      if (
        result.roundsPlayedDelta > 0 ||
        result.roundsWonDelta > 0 ||
        result.gamesPlayedDelta > 0 ||
        result.gamesWonDelta > 0
      ) {
        statRowsRepaired++;
        repaired.push(result);
      }
    }

    const repairedRounds = repaired.reduce((sum, row) => sum + row.roundsPlayedDelta, 0);
    const repairedMatches = repaired.reduce((sum, row) => sum + row.gamesPlayedDelta, 0);
    return ok({
      scanned,
      roundsBackfilled: roundsBackfilled + repairedRounds,
      matchesBackfilled: matchesBackfilled + repairedMatches,
      statRowsRepaired,
      details,
      repaired,
    });
  } catch (err) {
    console.error("backfill-stats failed", err);
    return serverError();
  }
});
