const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const tables = {
  users: process.env.USERS_TABLE,
  matches: process.env.MATCHES_TABLE,
  matchCodes: process.env.MATCH_CODES_TABLE,
  stats: process.env.STATS_TABLE,
};

module.exports = { ddb, tables };