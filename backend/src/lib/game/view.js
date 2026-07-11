// Redact a match state for a given viewer: replace other players' hands
// with counts, and hide the stock pile contents.
function redactForUser(match, userId) {
  const view = { ...match };
  if (match.hands) {
    const handCounts = {};
    const hands = {};
    for (const [p, cards] of Object.entries(match.hands)) {
      handCounts[p] = cards.length;
      if (p === userId) hands[p] = cards;
    }
    view.hands = hands;
    view.handCounts = handCounts;
  }
  if (Array.isArray(match.stock)) {
    view.stockCount = match.stock.length;
    delete view.stock;
  }
  return view;
}

module.exports = { redactForUser };