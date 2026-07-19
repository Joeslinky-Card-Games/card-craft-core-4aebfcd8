const { ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, tables } = require("../../lib/dynamo");
const { ok, serverError } = require("../../lib/response");
const { withAuth } = require("../../lib/auth");

// Debug: dump all rows in StatsTable so we can see whether writes landed.
exports.handler = withAuth(async () => {
  try {
    const items = [];
    let ExclusiveStartKey;
    do {
      const res = await ddb.send(
        new ScanCommand({ TableName: tables.stats, ExclusiveStartKey })
      );
      items.push(...(res.Items || []));
      ExclusiveStartKey = res.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return ok({ count: items.length, items });
  } catch (err) {
    console.error("stats dump failed", err);
    return serverError();
  }
});