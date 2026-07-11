const { ok } = require("../../lib/response");
const { GAMES } = require("../../lib/games");

exports.handler = async () => ok({ games: GAMES });