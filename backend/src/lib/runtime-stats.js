// Aggregates completed-match runtimes into the existing stats table under a
// synthetic userId so we don't need a new DynamoDB table. Each game has a
// single row keyed by { userId: "__runtime__", gameId }. Per-player-count
// totals are stored as flat pairs (p{n}Ms, p{n}Cnt) so updates only need
// simple ADD expressions.
const { GetCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, tables } = require("./dynamo");

const RUNTIME_USER_ID = "__runtime__";

function parsePlayerCount(match) {
  const players = Array.isArray(match?.players) ? match.players : [];
  return players.length;
}

function computeDurationMs(match) {
  if (!match?.startedAt || !match?.completedAt) return null;
  const start = Date.parse(match.startedAt);
  const end = Date.parse(match.completedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const ms = end - start;
  // Guard against clock skew / bogus data.
  if (ms <= 0 || ms > 24 * 60 * 60 * 1000) return null;
  return ms;
}

async function recordCompletedMatch(match) {
  if (!match || match.status !== "complete" || match.runtimeRecorded) return false;
  const gameId = match.gameId;
  if (!gameId) return false;
  const durationMs = computeDurationMs(match);
  if (durationMs == null) return false;
  const players = parsePlayerCount(match);
  if (players < 2) return false;

  const msAttr = `p${players}Ms`;
  const cntAttr = `p${players}Cnt`;
  await ddb.send(new UpdateCommand({
    TableName: tables.stats,
    Key: { userId: RUNTIME_USER_ID, gameId },
    UpdateExpression:
      "ADD #ms :ms, #cnt :one, totalMs :ms, totalCnt :one SET updatedAt = :now",
    ExpressionAttributeNames: { "#ms": msAttr, "#cnt": cntAttr },
    ExpressionAttributeValues: {
      ":ms": durationMs,
      ":one": 1,
      ":now": new Date().toISOString(),
    },
  }));
  return true;
}

async function getRuntimeStats(gameId) {
  const res = await ddb.send(new GetCommand({
    TableName: tables.stats,
    Key: { userId: RUNTIME_USER_ID, gameId },
  }));
  const row = res.Item;
  const byPlayers = {};
  let totalMs = 0;
  let totalCnt = 0;
  if (row) {
    for (const [key, val] of Object.entries(row)) {
      const m = /^p(\d+)Ms$/.exec(key);
      if (!m) continue;
      const n = m[1];
      const cnt = Number(row[`p${n}Cnt`] || 0);
      const ms = Number(val || 0);
      if (cnt > 0) {
        byPlayers[n] = { avgMs: Math.round(ms / cnt), count: cnt };
      }
    }
    totalMs = Number(row.totalMs || 0);
    totalCnt = Number(row.totalCnt || 0);
  }
  return {
    gameId,
    byPlayers,
    overallAvgMs: totalCnt > 0 ? Math.round(totalMs / totalCnt) : null,
    totalCount: totalCnt,
  };
}

module.exports = { recordCompletedMatch, getRuntimeStats, RUNTIME_USER_ID };