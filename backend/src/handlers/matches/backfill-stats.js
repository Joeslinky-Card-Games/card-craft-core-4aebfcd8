const { GetCommand, ScanCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, tables } = require("../../lib/dynamo");
const { ok, serverError } = require("../../lib/response");
const { withAuth } = require("../../lib/auth");
const { gameIdForStats, recordRoundCompletion, recordMatchCompletion } = require("../../lib/stats");

function isHuman(playerId) {
  return typeof playerId === "string" && !playerId.startsWith("ai-");
}

async function hasAnyStatsForMatch(match) {
  const canonicalGameId = gameIdForStats(match);
  const rawGameId = typeof match?.gameId === "string" && match.gameId ? match.gameId : canonicalGameId;
  const gameIds = Array.from(new Set([canonicalGameId, rawGameId]));
  const humans = (match.players || []).filter(isHuman);
  for (const userId of humans) {
    for (const gameId of gameIds) {
      const res = await ddb.send(
        new GetCommand({ TableName: tables.stats, Key: { userId, gameId } })
      );
      if (res.Item) return true;
    }
  }
  return false;
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
    let ExclusiveStartKey;
    do {
      const res = await ddb.send(new ScanCommand({
        TableName: tables.matches,
        ExclusiveStartKey,
      }));
      for (const match of res.Items || []) {
        scanned++;
        const round = Number(match.round || 0);
        const recordedThrough = Number(match.roundsRecordedThrough || 0);
        const roundIsOver = match.status === "round-complete" || match.status === "complete";
        const matchIsOver = match.status === "complete";
        const hasStats = roundIsOver && round > 0 ? await hasAnyStatsForMatch(match) : true;
        const missingStatsRepair = roundIsOver && round > 0 && !hasStats;
        const isRoundDone =
          roundIsOver && round > 0 && (recordedThrough < round || missingStatsRepair);
        const isMatchDone = matchIsOver && (!match.statsRecorded || missingStatsRepair);
        if (!isRoundDone && !isMatchDone) {
          details.push({
            matchId: match.matchId,
            status: match.status,
            round,
            recordedThrough,
            hasStats,
            skipped: true,
          });
          continue;
        }

        if (isRoundDone) {
          await recordRoundCompletion(match);
          match.roundsRecordedThrough = round;
          roundsBackfilled++;
        }
        if (isMatchDone) {
          await recordMatchCompletion(match);
          match.statsRecorded = true;
          matchesBackfilled++;
        }
        await ddb.send(new PutCommand({ TableName: tables.matches, Item: match }));
        details.push({
          matchId: match.matchId,
          status: match.status,
          round,
          recordedThrough,
          hasStats,
          recordedRound: isRoundDone,
          recordedMatch: isMatchDone,
        });
      }
      ExclusiveStartKey = res.LastEvaluatedKey;
    } while (ExclusiveStartKey);

    return ok({ scanned, roundsBackfilled, matchesBackfilled, details });
  } catch (err) {
    console.error("backfill-stats failed", err);
    return serverError();
  }
});
