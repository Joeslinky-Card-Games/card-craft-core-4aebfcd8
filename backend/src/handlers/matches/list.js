const { QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, tables } = require("../../lib/dynamo");
const { ok, serverError } = require("../../lib/response");

exports.handler = async (event) => {
  const status = event.queryStringParameters?.status || "open";
  try {
    const res = await ddb.send(
      new QueryCommand({
        TableName: tables.matches,
        IndexName: "byStatus",
        KeyConditionExpression: "#s = :s",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":s": status },
        ScanIndexForward: false,
        Limit: 50,
      })
    );
    return ok({ matches: res.Items || [] });
  } catch (err) {
    console.error(err);
    return serverError();
  }
};