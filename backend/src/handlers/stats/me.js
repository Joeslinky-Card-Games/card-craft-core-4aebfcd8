const { QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, tables } = require("../../lib/dynamo");
const { ok, serverError } = require("../../lib/response");
const { withAuth } = require("../../lib/auth");

exports.handler = withAuth(async (_event, { userId }) => {
  try {
    const res = await ddb.send(
      new QueryCommand({
        TableName: tables.stats,
        KeyConditionExpression: "userId = :u",
        ExpressionAttributeValues: { ":u": userId },
      })
    );
    return ok({ stats: res.Items || [] });
  } catch (err) {
    console.error(err);
    return serverError();
  }
});