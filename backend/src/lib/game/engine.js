const { buildDeck, shuffle } = require("./deck");
const { handSizeForRound, wildRankForRound } = require("./cards");
const { validateGoingOut } = require("./melds");
const { scoreHand } = require("./score");
const { minUnmeldedPoints } = require("./autoMeld");

const TOTAL_ROUNDS = 13;

function startMatch({ matchId, players }) {
  if (!Array.isArray(players) || players.length < 2 || players.length > 6) {
    throw new Error("Charlotte's Web requires 2-6 players");
  }
  return {
    matchId,
    players: players.slice(),
    round: 0,
    scores: Object.fromEntries(players.map((p) => [p, 0])),
    status: "waiting",
    version: 0,
    hands: {},
    stock: [],
    discard: [],
    turn: 0,
    wildRank: null,
    handSize: 0,
    goneOutBy: null,
    remainingFinalTurns: 0,
    hasDrawn: false,
    lastRoundScores: null,
    laidMelds: {},
    _order: [],
  };
}

function startRound(state, round) {
  const handSize = handSizeForRound(round);
  const wildRank = wildRankForRound(round);
  const seed = `${state.matchId}:${round}`;
  const deck = shuffle(buildDeck(), seed);
  const hands = {};
  const dealerIdx = (round - 1) % state.players.length;
  const order = [];
  for (let i = 1; i <= state.players.length; i++) {
    order.push(state.players[(dealerIdx + i) % state.players.length]);
  }
  for (const p of order) hands[p] = [];
  let idx = 0;
  for (let i = 0; i < handSize; i++) {
    for (const p of order) hands[p].push(deck[idx++]);
  }
  const discard = [deck[idx++]];
  const stock = deck.slice(idx);
  return {
    ...state,
    round,
    handSize,
    wildRank,
    hands,
    stock,
    discard,
    turn: 0,
    status: "in-progress",
    goneOutBy: null,
    remainingFinalTurns: 0,
    hasDrawn: false,
    laidMelds: {},
    _order: order,
  };
}

function currentPlayer(state) {
  return state._order[state.turn % state._order.length];
}

function advanceTurn(state) {
  state.turn = (state.turn + 1) % state._order.length;
  state.hasDrawn = false;
  if (state.goneOutBy != null) state.remainingFinalTurns -= 1;
}

function applyAction(state, userId, action) {
  if (state.status !== "in-progress") throw new Error("Match not in progress");
  const cp = currentPlayer(state);
  if (userId !== cp) throw new Error("Not your turn");
  switch (action.type) {
    case "draw-stock": return doDrawStock(state, userId);
    case "draw-discard": return doDrawDiscard(state, userId);
    case "discard": return doDiscard(state, userId, action.card);
    case "lay-down": return doLayDown(state, userId, action.melds, action.discard);
    default: throw new Error(`Unknown action: ${action.type}`);
  }
}

function doDrawStock(state, userId) {
  if (state.hasDrawn) throw new Error("Already drew this turn");
  if (state.stock.length === 0) {
    if (state.discard.length <= 1) throw new Error("No cards left to draw");
    const top = state.discard[state.discard.length - 1];
    const rest = state.discard.slice(0, -1);
    state.stock = shuffle(rest, `${state.matchId}:${state.round}:reshuffle:${state.turn}`);
    state.discard = [top];
  }
  const card = state.stock.shift();
  state.hands[userId].push(card);
  state.hasDrawn = true;
  state.version++;
  return state;
}

function doDrawDiscard(state, userId) {
  if (state.hasDrawn) throw new Error("Already drew this turn");
  if (state.discard.length === 0) throw new Error("Discard pile is empty");
  const card = state.discard.pop();
  state.hands[userId].push(card);
  state.hasDrawn = true;
  state.version++;
  return state;
}

function doDiscard(state, userId, card) {
  if (!state.hasDrawn) throw new Error("Must draw before discarding");
  const hand = state.hands[userId];
  const idx = hand.indexOf(card);
  if (idx < 0) throw new Error("Card not in hand");
  hand.splice(idx, 1);
  state.discard.push(card);
  advanceTurn(state);
  state.version++;
  maybeFinalize(state);
  return state;
}

function doLayDown(state, userId, melds, discardCard) {
  if (!state.hasDrawn) throw new Error("Must draw before laying down");
  const hand = state.hands[userId];
  const res = validateGoingOut(melds, hand, discardCard, state.wildRank);
  if (!res.ok) throw new Error(`Invalid lay-down: ${res.reason}`);
  if (state.laidMelds && state.laidMelds[userId]) {
    throw new Error("You already went out this round");
  }
  state.hands[userId] = [];
  state.discard.push(discardCard);
  state.laidMelds[userId] = melds;
  advanceTurn(state);
  // First player out sets the final-turn countdown for everyone else.
  // Subsequent players are simply using one of their remaining final turns
  // to also go out — they don't reset the counter, they just also score 0.
  if (!state.goneOutBy) {
    state.goneOutBy = userId;
    state.remainingFinalTurns = state._order.length - 1;
  }
  state.version++;
  maybeFinalize(state);
  return state;
}

function maybeFinalize(state) {
  if (state.goneOutBy && state.remainingFinalTurns <= 0) finalizeRound(state);
}

function finalizeRound(state) {
  const deltas = {};
  for (const p of state.players) {
    if (p === state.goneOutBy || state.laidMelds?.[p]) {
      deltas[p] = 0;
    } else {
      // Score using the best possible meld arrangement so players who did not
      // formally lay down are not penalized for cards that could have been melded.
      deltas[p] = minUnmeldedPoints(state.hands[p] || [], state.wildRank);
    }
    state.scores[p] += deltas[p];
  }
  state.lastRoundScores = deltas;
  if (state.round >= TOTAL_ROUNDS) {
    state.status = "complete";
    const sorted = state.players.slice().sort((a, b) => state.scores[a] - state.scores[b]);
    state.winner = sorted[0];
  } else {
    state.status = "round-complete";
  }
}

function nextRound(state) {
  if (state.status !== "round-complete") throw new Error("Round not complete");
  return startRound(state, state.round + 1);
}

module.exports = { TOTAL_ROUNDS, startMatch, startRound, applyAction, finalizeRound, nextRound, currentPlayer };