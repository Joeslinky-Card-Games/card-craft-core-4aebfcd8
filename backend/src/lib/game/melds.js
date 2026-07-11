const { parseCard, RANK_ORDER } = require("./cards");

// A card that matches the wild rank may be used as EITHER a wild or a natural.
// Jokers are always wild. We enumerate every choice of which wild-rank cards
// count as naturals, and accept a meld if any choice is valid.
function forEachClassification(cards, wildRank, cb) {
  const parsed = cards.map(parseCard);
  const flex = []; // indices of wild-rank (non-joker) cards
  for (let i = 0; i < parsed.length; i++) {
    const c = parsed[i];
    if (!c.joker && c.rank === wildRank) flex.push(i);
  }
  const n = flex.length;
  for (let mask = 0; mask < (1 << n); mask++) {
    const wilds = [];
    const naturals = [];
    for (let i = 0; i < parsed.length; i++) {
      const c = parsed[i];
      if (c.joker) { wilds.push(c); continue; }
      const flexIdx = flex.indexOf(i);
      if (flexIdx >= 0) {
        const asNatural = ((mask >> flexIdx) & 1) === 1;
        (asNatural ? naturals : wilds).push(c);
      } else {
        naturals.push(c);
      }
    }
    if (cb(wilds, naturals)) return true;
  }
  return false;
}

function setShape(wilds, naturals) {
  if (naturals.length <= wilds.length) return false;
  const ranks = new Set(naturals.map((c) => c.rank));
  return ranks.size === 1;
}

function runShape(wilds, naturals, L) {
  if (naturals.length <= wilds.length) return false;
  const suits = new Set(naturals.map((c) => c.suit));
  if (suits.size !== 1) return false;

  const fixed = [];
  let aceCount = 0;
  const seen = new Set();
  for (const c of naturals) {
    if (c.rank === "A") { aceCount++; continue; }
    const p = RANK_ORDER[c.rank];
    if (seen.has(p)) return false; // two naturals on same slot impossible
    seen.add(p);
    fixed.push(p);
  }

  for (let start = 1; start + L - 1 <= 14; start++) {
    const end = start + L - 1;
    const used = new Set();
    let ok = true;
    for (const p of fixed) {
      if (p < start || p > end || used.has(p)) { ok = false; break; }
      used.add(p);
    }
    if (!ok) continue;
    const aceSlots = [];
    if (1 >= start && 1 <= end && !used.has(1)) aceSlots.push(1);
    if (14 >= start && 14 <= end && !used.has(14)) aceSlots.push(14);
    if (aceCount > aceSlots.length) continue;
    for (let i = 0; i < aceCount; i++) used.add(aceSlots[i]);
    const remaining = L - used.size;
    if (remaining === wilds.length) return true;
  }
  return false;
}

function validateSet(cards, wildRank) {
  if (!Array.isArray(cards) || cards.length < 3 || cards.length > 4) return false;
  if (new Set(cards).size !== cards.length) return false;
  return forEachClassification(cards, wildRank, (w, n) => setShape(w, n));
}

function validateRun(cards, wildRank) {
  if (!Array.isArray(cards) || cards.length < 3) return false;
  if (new Set(cards).size !== cards.length) return false;
  const L = cards.length;
  return forEachClassification(cards, wildRank, (w, n) => runShape(w, n, L));
}

function validateMeld(cards, wildRank) {
  return validateSet(cards, wildRank) || validateRun(cards, wildRank);
}

// All melds valid and no card appears in more than one meld.
function validateMeldSet(melds, wildRank) {
  const seen = new Set();
  for (const meld of melds) {
    if (!validateMeld(meld, wildRank)) return { ok: false, reason: "invalid-meld", meld };
    for (const c of meld) {
      if (seen.has(c)) return { ok: false, reason: "duplicate-card", card: c };
      seen.add(c);
    }
  }
  return { ok: true, used: seen };
}

// For going out: every card in hand must appear in exactly one meld,
// minus the one card being discarded on the going-out turn.
function validateGoingOut(melds, hand, discardCard, wildRank) {
  if (!hand.includes(discardCard)) return { ok: false, reason: "discard-not-in-hand" };
  const mustMeld = hand.filter((c) => c !== discardCard);
  const res = validateMeldSet(melds, wildRank);
  if (!res.ok) return res;
  if (res.used.size !== mustMeld.length) return { ok: false, reason: "card-count-mismatch" };
  for (const c of mustMeld) {
    if (!res.used.has(c)) return { ok: false, reason: "unmelded-card", card: c };
  }
  return { ok: true };
}

module.exports = { validateSet, validateRun, validateMeld, validateMeldSet, validateGoingOut };