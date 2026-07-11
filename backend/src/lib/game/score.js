const { cardPoints } = require("./cards");

// Score a hand's *unmelded* cards. Players who went out score 0 (caller decides).
function scoreHand(unmeldedCards) {
  return unmeldedCards.reduce((sum, c) => sum + cardPoints(c), 0);
}

module.exports = { scoreHand };