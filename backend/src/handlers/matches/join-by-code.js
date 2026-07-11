const { GetCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, tables } = require("../../lib/dynamo");
const { badRequest, notFound } = require("../../lib/response");
const { withAuth } = require("../../lib/auth");
const { normalizeCode } = require("../../lib/matches");
const { joinMatch } = require("../../lib/match-join");

exports.handler = withAuth(async (event, { userId, claims }) => {
  let body = {};
  try { body = event.body ? JSON.parse(event.body) : {}; } catch { return badRequest("Invalid JSON"); }

  const code = normalizeCode(body?.code);
  if (!code) return badRequest("Invalid table code");

  const lookup = await ddb.send(new GetCommand({
    TableName: tables.matchCodes,
    Key: { code },
  }));
  const matchId = lookup.Item?.matchId;
  if (!matchId) return notFound("Table not found");

  return joinMatch({ matchId, userId, claims, body });
});