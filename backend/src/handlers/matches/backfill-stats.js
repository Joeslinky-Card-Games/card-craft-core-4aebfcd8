const { ScanCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, tables } = require("../../lib/dynamo");
const { ok, serverError } = require("../../lib/response");
const { withAuth } = require("../../lib/auth");
const { recordRoundCompletion, recordMatchCompletion } = require("../../lib/stats");

// One-shot backfill for historical matches whose stats were never recorded.
// Idempotent: skips matches already flagged. Any authenticated user may call
// it (writes only advance counters and set flags — cannot decrement).
exports.handler = withAuth(async () => {
  try {
    let scanned = 0;
    let roundsBackfilled = 0;
    let matchesBackfilled = 0;
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
        const isRoundDone =
          (match.status === "round-complete" || match.status === "complete") &&
          round > 0 &&
          recordedThrough < round;
        const isMatchDone = match.status === "complete" && !match.statsRecorded;
        if (!isRoundDone && !isMatchDone) continue;

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
      }
      ExclusiveStartKey = res.LastEvaluatedKey;
    } while (ExclusiveStartKey);

    return ok({ scanned, roundsBackfilled, matchesBackfilled });
  } catch (err) {
    console.error("backfill-stats failed", err);
    return serverError();
  }
});
