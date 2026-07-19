// Route match state through the right engine based on gameId.
const cwEngine = require("./game/engine");
const cwView = require("./game/view");
const cwAI = require("./game/ai");

const saEngine = require("./stackattack/engine");
const saView = require("./stackattack/view");
const saAI = require("./stackattack/ai");

const REGISTRY = {
  "charlottes-web": { engine: cwEngine, view: cwView, ai: cwAI },
  "stack-attack": { engine: saEngine, view: saView, ai: saAI },
};

function pick(gameId) {
  return REGISTRY[gameId] || REGISTRY["charlottes-web"];
}

function startMatch(gameId, args) { return pick(gameId).engine.startMatch(args); }
function startRound(gameId, state, round) { return pick(gameId).engine.startRound(state, round); }
function applyAction(match, userId, action) { return pick(match.gameId).engine.applyAction(match, userId, action); }
function currentPlayer(match) { return pick(match.gameId).engine.currentPlayer(match); }
function nextRound(match) { return pick(match.gameId).engine.nextRound(match); }
function redactForUser(match, userId) { return pick(match.gameId).view.redactForUser(match, userId); }
function chooseAction(match, userId) { return pick(match.gameId).ai.chooseAction(match, userId); }

module.exports = { startMatch, startRound, applyAction, currentPlayer, nextRound, redactForUser, chooseAction };