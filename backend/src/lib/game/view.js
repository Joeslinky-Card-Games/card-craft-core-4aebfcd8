// Redact a match state for a given viewer: replace other players' hands
// with counts during play, expose all hands once a round/match is complete,
// and hide the stock pile contents.
function redactForUser(match, userId) {
  const view = { ...match };
  const roundOver = match.status === "round-complete" || match.status === "complete";
  if (match.hands) {
    const handCounts = {};
    const hands = {};
    for (const [p, cards] of Object.entries(match.hands)) {
      handCounts[p] = cards.length;
      if (p === userId || roundOver) hands[p] = cards;
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