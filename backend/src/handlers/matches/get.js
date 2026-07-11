const { GetCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, tables } = require("../../lib/dynamo");
const { ok, notFound, serverError } = require("../../lib/response");
const { withAuth } = require("../../lib/auth");

exports.handler = withAuth(async (event) => {
  const matchId = event.pathParameters?.matchId;
  try {
    const res = await ddb.send(new GetCommand({ TableName: tables.matches, Key: { matchId } }));
    if (!res.Item) return notFound();
    return ok(res.Item);
  } catch (err) {
    console.error(err);
    return serverError();
  }
});