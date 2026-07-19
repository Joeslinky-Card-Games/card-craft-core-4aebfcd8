// Redact Stack Attack state for a viewer.
// - Own hand visible; opponents' hands only as counts.
// - Stock bodies hidden everywhere; top card visible via stockTops.
// - Discard piles fully visible (face-up game).
// - Draw pile hidden; only a count is exposed.
function redactForUser(match, userId) {
  const view = { ...match };
  if (match.hands) {
    const handCounts = {};
    const hands = {};
    for (const [p, cards] of Object.entries(match.hands)) {
      handCounts[p] = cards.length;
      if (p === userId || match.status === "complete") hands[p] = cards;
    }
    view.hands = hands;
    view.handCounts = handCounts;
  }
  if (match.stocks) {
    const stockCounts = {};
    const stockTops = {};
    for (const [p, cards] of Object.entries(match.stocks)) {
      stockCounts[p] = cards.length;
      stockTops[p] = cards.length ? cards[cards.length - 1] : null;
    }
    view.stockCounts = stockCounts;
    view.stockTops = stockTops;
    delete view.stocks;
  }
  if (Array.isArray(match.drawPile)) {
    view.drawPileCount = match.drawPile.length;
    delete view.drawPile;
  }
  if (Array.isArray(match.archive)) {
    view.archiveCount = match.archive.length;
    delete view.archive;
  }
  return view;
}

module.exports = { redactForUser };