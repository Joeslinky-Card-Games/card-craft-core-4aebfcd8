const { ScanCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, tables } = require("../../lib/dynamo");
const { ok, serverError } = require("../../lib/response");
const { withAuth } = require("../../lib/auth");
const { recordRoundsBackfill, recordMatchCompletion } = require("../../lib/stats");

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

    return ok({ scanned, roundsBackfilled, matchesBackfilled, details });
  } catch (err) {
    console.error("backfill-stats failed", err);
    return serverError();
  }
});
