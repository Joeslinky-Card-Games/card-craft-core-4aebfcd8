// Heuristic AI for Charlotte's Web. Given full (unredacted) match state and
// the AI player's userId, returns the next single action the bot should take.
// The action handler drives the bot forward one action at a time via
// applyAction so state remains consistent with human play.
const { validateMeld, validateGoingOut } = require("./melds");
const { cardPoints, isWild } = require("./cards");

function combinations(arr, k, cb) {
  const cur = [];
  const rec = (start) => {
    if (cur.length === k) { cb(cur); return; }
    for (let i = start; i <= arr.length - (k - cur.length); i++) {
      cur.push(arr[i]); rec(i + 1); cur.pop();
    }
  };
  rec(0);
}

// Find the meld arrangement that maximizes melded card points. Returns the
// chosen melds (as card-id arrays), the remaining unmelded cards, and totals.
function bestArrangement(hand, wildRank) {
  const n = hand.length;
  if (n === 0) return { melds: [], unmelded: [], meldedPts: 0, unmeldedPts: 0 };
  const pts = hand.map(cardPoints);
  const total = pts.reduce((a, b) => a + b, 0);
  const indices = hand.map((_, i) => i);
  const cands = [];
  const maxSize = Math.min(n, 8);
  for (let k = 3; k <= maxSize; k++) {
    combinations(indices, k, (combo) => {
      const cards = combo.map((i) => hand[i]);
      if (validateMeld(cards, wildRank)) {
        let mask = 0, p = 0;
        for (const i of combo) { mask |= 1 << i; p += pts[i]; }
        cands.push({ mask, pts: p, cards: cards.slice() });
      }
    });
  }
  cands.sort((a, b) => b.pts - a.pts);

  let best = { pts: 0, melds: [], mask: 0 };
  const dfs = (start, used, meldedPts, picked) => {
    if (meldedPts > best.pts) {
      best = { pts: meldedPts, melds: picked.slice(), mask: used };
    }
    let remaining = 0;
    for (let i = start; i < cands.length; i++) {
      if ((cands[i].mask & used) === 0) remaining += cands[i].pts;
    }
    if (meldedPts + remaining <= best.pts) return;
    for (let i = start; i < cands.length; i++) {
      const c = cands[i];
      if ((c.mask & used) !== 0) continue;
      picked.push(c);
      dfs(i + 1, used | c.mask, meldedPts + c.pts, picked);
      picked.pop();
    }
  };
  dfs(0, 0, 0, []);

  const unmelded = [];
  for (let i = 0; i < n; i++) if (!(best.mask & (1 << i))) unmelded.push(hand[i]);
  return {
    melds: best.melds.map((c) => c.cards),
    unmelded,
    meldedPts: best.pts,
    unmeldedPts: total - best.pts,
  };
}

function chooseDraw(state, userId) {
  const hand = state.hands[userId] || [];
  const top = state.discard[state.discard.length - 1];
  if (!top) return { type: "draw-stock" };
  // Wilds are always worth grabbing.
  if (isWild(top, state.wildRank)) return { type: "draw-discard" };
  const before = bestArrangement(hand, state.wildRank).meldedPts;
  const after = bestArrangement([...hand, top], state.wildRank).meldedPts;
  const improvement = after - before;
  // Take the discard if it materially improves our melded coverage.
  if (improvement >= Math.max(cardPoints(top), 5)) return { type: "draw-discard" };
  return { type: "draw-stock" };
}

function choosePostDraw(state, userId) {
  const hand = state.hands[userId] || [];
  const wildRank = state.wildRank;
  const arr = bestArrangement(hand, wildRank);

  // Case A: exactly one unmelded card — go out by discarding it.
  if (arr.unmelded.length === 1) {
    const discardCard = arr.unmelded[0];
    const check = validateGoingOut(arr.melds, hand, discardCard, wildRank);
    if (check.ok) return { type: "lay-down", melds: arr.melds, discard: discardCard };
  }

  // Case B: whole hand melds — must break one meld to discard. Try each card,
  // lowest points first, and lay down if the remainder still fully melds.
  if (arr.unmelded.length === 0) {
    const ordered = hand.slice().sort((a, b) => cardPoints(a) - cardPoints(b));
    for (const c of ordered) {
      const remaining = hand.filter((x) => x !== c);
      const sub = bestArrangement(remaining, wildRank);
      if (sub.unmelded.length === 0) {
        const check = validateGoingOut(sub.melds, hand, c, wildRank);
        if (check.ok) return { type: "lay-down", melds: sub.melds, discard: c };
      }
    }
  }

  // Otherwise discard the highest-point unmelded card (fallback: highest in hand).
  const pool = arr.unmelded.length ? arr.unmelded : hand;
  let bestCard = pool[0];
  let bestPts = -1;
  for (const c of pool) {
    const p = cardPoints(c);
    if (p > bestPts) { bestPts = p; bestCard = c; }
  }
  return { type: "discard", card: bestCard };
}

function chooseAction(state, userId) {
  if (!state.hasDrawn) return chooseDraw(state, userId);
  return choosePostDraw(state, userId);
}

module.exports = { chooseAction, bestArrangement };