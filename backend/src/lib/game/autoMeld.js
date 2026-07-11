// Compute the minimum possible unmelded-card point total for a hand,
// considering all valid ways to partition (a subset of) cards into melds.
// Mirrors the client-side autoArrange DFS in src/lib/game/melds.ts.
const { validateMeld } = require("./melds");
const { cardPoints } = require("./cards");

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

function sumBitsPts(mask, pts) {
  let s = 0, i = 0;
  while (mask) { if (mask & 1) s += pts[i]; mask >>>= 1; i++; }
  return s;
}

function minUnmeldedPoints(hand, wildRank) {
  const n = hand.length;
  if (n === 0) return 0;
  const pts = hand.map((c) => cardPoints(c));
  const total = pts.reduce((a, b) => a + b, 0);
  const indices = hand.map((_, i) => i);
  const cands = [];
  const maxSize = Math.min(n, 8);
  for (let k = 3; k <= maxSize; k++) {
    combinations(indices, k, (combo) => {
      const cards = combo.map((i) => hand[i]);
      if (validateMeld(cards, wildRank)) {
        let mask = 0;
        for (const i of combo) mask |= 1 << i;
        cands.push({ mask, pts: sumBitsPts(mask, pts) });
      }
    });
  }
  cands.sort((a, b) => b.pts - a.pts);

  let bestMelded = 0;
  const dfs = (start, usedMask, meldedPts) => {
    if (meldedPts > bestMelded) bestMelded = meldedPts;
    let remaining = 0;
    for (let i = start; i < cands.length; i++) {
      if ((cands[i].mask & usedMask) === 0) remaining += cands[i].pts;
    }
    if (meldedPts + remaining <= bestMelded) return;
    for (let i = start; i < cands.length; i++) {
      const c = cands[i];
      if ((c.mask & usedMask) !== 0) continue;
      dfs(i + 1, usedMask | c.mask, meldedPts + c.pts);
    }
  };
  dfs(0, 0, 0);
  return total - bestMelded;
}

module.exports = { minUnmeldedPoints };