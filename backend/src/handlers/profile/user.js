const { GetCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, tables } = require("../../lib/dynamo");
const { ok, badRequest, serverError } = require("../../lib/response");
const { withAuth } = require("../../lib/auth");

// GET /profile/user/{userId}
// Returns the public-facing profile for any user: their stored username,
// last-active timestamp, and per-game stats (including gamerscore history
// used to render the points-over-time chart).
exports.handler = withAuth(async (event) => {
  const userId = event.pathParameters?.userId;
  if (!userId) return badRequest("userId required");
  try {
    const [userRes, statsRes] = await Promise.all([
      ddb.send(new GetCommand({ TableName: tables.users, Key: { userId } })),
      ddb.send(
        new QueryCommand({
          TableName: tables.stats,
          KeyConditionExpression: "userId = :u",
          ExpressionAttributeValues: { ":u": userId },
        })
      ),
    ]);
    const profile = userRes.Item || null;
    const stats = statsRes.Items || [];
    // Prefer the most recent stats.username if the user record is missing it.
    const derivedName =
      profile?.username ||
      stats.slice().sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))[0]?.username ||
      null;
    // Latest activity across profile heartbeats and completed matches.
    const lastActiveAt =
      [profile?.lastActiveAt, profile?.updatedAt, profile?.createdAt, ...stats.map((s) => s.updatedAt)]
        .filter(Boolean)
        .sort()
        .pop() || null;
    return ok({
      userId,
      username: derivedName,
      avatarUrl: profile?.avatarUrl || null,
      createdAt: profile?.createdAt || null,
      lastActiveAt,
      stats,
    });
  } catch (err) {
    console.error(err);
    return serverError();
  }
});