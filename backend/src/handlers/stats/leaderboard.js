const { QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, tables } = require("../../lib/dynamo");
const { ok, badRequest, serverError } = require("../../lib/response");

exports.handler = async (event) => {
  const gameId = event.queryStringParameters?.gameId;
  if (!gameId) return badRequest("gameId query param required");
  try {
    const res = await ddb.send(
      new QueryCommand({
        TableName: tables.stats,
        IndexName: "byGame",
        KeyConditionExpression: "gameId = :g",
        ExpressionAttributeValues: { ":g": gameId },
        ScanIndexForward: false,
        Limit: 25,
      })
    );
    return ok({ gameId, leaderboard: res.Items || [] });
  } catch (err) {
    console.error(err);
    return serverError();
  }
};