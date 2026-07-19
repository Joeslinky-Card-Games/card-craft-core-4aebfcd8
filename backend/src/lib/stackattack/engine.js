const { buildDeck, shuffle, isWild, rankOf } = require("./deck");

// Stock size scales down with player count so games stay ~15-20 min.
function stockSizeFor(n) {
  if (n <= 2) return 20;
  if (n <= 4) return 15;
  return 10;
}

function startMatch({ matchId, players }) {
  if (!Array.isArray(players) || players.length < 2 || players.length > 6) {
    throw new Error("Stack Attack requires 2-6 players");
  }
  return {
    matchId,
    players: players.slice(),
    round: 0,
    scores: Object.fromEntries(players.map((p) => [p, 0])),
    status: "waiting",
    version: 0,
    hands: {},
    stocks: {},
    discards: {},
    buildPiles: [[], [], [], []],
    archive: [],
    drawPile: [],
    completedCount: 0,
    turn: 0,
    winner: null,
    _order: [],
  };
}

function startRound(state, round) {
  const seed = `sa:${state.matchId}:${round}`;
  const deck = shuffle(buildDeck(), seed);
  const dealerIdx = (round - 1) % state.players.length;
  const order = [];
  for (let i = 1; i <= state.players.length; i++) {
    order.push(state.players[(dealerIdx + i) % state.players.length]);
  }
  const stockSize = stockSizeFor(state.players.length);
  const stocks = {};
  const hands = {};
  const discards = {};
  let idx = 0;
  for (const p of order) {
    stocks[p] = deck.slice(idx, idx + stockSize);
    idx += stockSize;
    hands[p] = [];
    discards[p] = [[], [], [], []];
  }
  // Deal 5 to every player up-front so the first turn can act immediately.
  for (const p of order) {
    hands[p] = deck.slice(idx, idx + 5);
    idx += 5;
  }
  return {
    ...state,
    round,
    hands,
    stocks,
    discards,
    buildPiles: [[], [], [], []],
    archive: [],
    drawPile: deck.slice(idx),
    completedCount: 0,
    turn: 0,
    status: "in-progress",
    winner: null,
    _order: order,
  };
}

function currentPlayer(state) {
  return state._order[state.turn % state._order.length];
}

function refillDrawIfNeeded(state, needed = 1) {
  if (state.drawPile.length >= needed) return;
  if (state.archive.length === 0) return;
  const seed = `sa:${state.matchId}:${state.round}:reshuffle:${state.turn}:${state.drawPile.length}`;
  const merged = state.drawPile.concat(state.archive);
  state.drawPile = shuffle(merged, seed);
  state.archive = [];
}

function drawToFive(state, player) {
  const hand = state.hands[player];
  while (hand.length < 5) {
    refillDrawIfNeeded(state, 1);
    if (state.drawPile.length === 0) break;
    hand.push(state.drawPile.shift());
  }
}

function nextBuildTarget(pile) {
  return pile.length + 1; // 1..12
}

function topOf(arr) { return arr.length ? arr[arr.length - 1] : null; }

function sourceCard(state, player, source) {
  if (source.from === "hand") {
    const c = state.hands[player][source.handIndex];
    return c ?? null;
  }
  if (source.from === "stock") {
    return topOf(state.stocks[player]);
  }
  if (source.from === "discard") {
    return topOf(state.discards[player][source.discardPileIndex]);
  }
  return null;
}

function removeSource(state, player, source) {
  if (source.from === "hand") {
    state.hands[player].splice(source.handIndex, 1);
  } else if (source.from === "stock") {
    state.stocks[player].pop();
  } else if (source.from === "discard") {
    state.discards[player][source.discardPileIndex].pop();
  }
}

function applyAction(match, userId, action) {
  if (match.status !== "in-progress") throw new Error("Match is not in progress");
  if (currentPlayer(match) !== userId) throw new Error("Not your turn");
  const state = JSON.parse(JSON.stringify(match));
  // Ensure hand is refilled at the very first action of a turn.
  drawToFive(state, userId);

  if (action.type === "play") {
    const src = { from: action.from, handIndex: action.handIndex, discardPileIndex: action.discardPileIndex };
    const card = sourceCard(state, userId, src);
    if (card == null) throw new Error("No card at source");
    const pileIdx = action.buildPileIndex;
    if (!Number.isInteger(pileIdx) || pileIdx < 0 || pileIdx > 3) throw new Error("Invalid build pile");
    const pile = state.buildPiles[pileIdx];
    const target = nextBuildTarget(pile);
    let effectiveRank;
    if (isWild(card)) {
      effectiveRank = target; // wild always plays as the next required rank
    } else {
      const r = rankOf(card);
      if (r !== target) throw new Error(`Build pile ${pileIdx + 1} needs ${target}`);
      effectiveRank = r;
    }
    removeSource(state, userId, src);
    pile.push({ card, asRank: effectiveRank });
    // Auto-complete when a pile reaches 12.
    if (pile.length >= 12) {
      state.archive.push(...pile.map((e) => e.card));
      state.buildPiles[pileIdx] = [];
      state.completedCount = (state.completedCount ?? 0) + 1;
    }
    // Win check
    if (state.stocks[userId].length === 0) {
      state.status = "complete";
      state.winner = userId;
      // Score = cards remaining in each opponent's stock (higher = worse).
      for (const p of state.players) {
        state.scores[p] = state.stocks[p]?.length ?? 0;
      }
      return state;
    }
    // If hand emptied via play (not discard), refill and continue.
    if (state.hands[userId].length === 0) {
      drawToFive(state, userId);
    }
    return state;
  }

  if (action.type === "discard") {
    const handIdx = action.handIndex;
    const pileIdx = action.discardPileIndex;
    if (!Number.isInteger(handIdx) || handIdx < 0 || handIdx >= state.hands[userId].length) {
      throw new Error("Invalid hand card");
    }
    if (!Number.isInteger(pileIdx) || pileIdx < 0 || pileIdx > 3) {
      throw new Error("Invalid discard pile");
    }
    const [card] = state.hands[userId].splice(handIdx, 1);
    state.discards[userId][pileIdx].push(card);
    // Advance turn — do not pre-draw for next player; they draw on their first action.
    state.turn = (state.turn + 1) % state._order.length;
    // Also, top of next player's stock stays face-up in view layer.
    return state;
  }

  throw new Error(`Unknown action ${action.type}`);
}

function nextRound(state) {
  // Stack Attack is single-round-per-match: nextRound just marks complete.
  return { ...state, status: "complete" };
}

module.exports = { startMatch, startRound, applyAction, currentPlayer, nextRound };