const { UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, tables } = require("../../lib/dynamo");
const { ok, badRequest, serverError } = require("../../lib/response");
const { withAuth } = require("../../lib/auth");

exports.handler = withAuth(async (event, { userId }) => {
  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return badRequest("Invalid JSON"); }
  const username = typeof body.username === "string" ? body.username.trim().slice(0, 32) : null;
  if (!username) return badRequest("username required");

  try {
    const res = await ddb.send(
      new UpdateCommand({
        TableName: tables.users,
        Key: { userId },
        UpdateExpression: "SET username = :u, updatedAt = :t",
        ExpressionAttributeValues: { ":u": username, ":t": new Date().toISOString() },
        ReturnValues: "ALL_NEW",
      })
    );
    return ok(res.Attributes);
  } catch (err) {
    console.error(err);
    return serverError();
  }
});