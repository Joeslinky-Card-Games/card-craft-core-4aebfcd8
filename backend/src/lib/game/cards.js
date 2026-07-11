// Card representation for Charlotte's Web.
//
// Card ID format (3 chars): {RANK}{SUIT}{DECK}
//   RANK: A 2 3 4 5 6 7 8 9 T J Q K
//   SUIT: S H D C
//   DECK: 1 or 2 (two 52-card decks)
// Joker ID format (3 chars): JK{N} where N is 1..4
//
// Every card in a match has a unique ID, so cards are trivially comparable
// by string equality.

const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K"];
const SUITS = ["S", "H", "D", "C"];

// Numeric rank order for runs. Ace can also act as 14 (high).
const RANK_ORDER = { A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, T: 10, J: 11, Q: 12, K: 13 };

// Points for unmelded cards at end of hand.
const RANK_POINTS = { A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, T: 10, J: 10, Q: 10, K: 10 };
const JOKER_POINTS = 50;

function parseCard(id) {
  if (typeof id !== "string" || id.length !== 3) {
    throw new Error(`Invalid card id: ${id}`);
  }
  if (id.startsWith("JK")) {
    const n = Number(id[2]);
    if (!Number.isInteger(n) || n < 1 || n > 4) throw new Error(`Invalid joker id: ${id}`);
    return { id, joker: true, rank: null, suit: null, deck: n };
  }
  const rank = id[0];
  const suit = id[1];
  const deck = Number(id[2]);
  if (!(rank in RANK_ORDER) || !SUITS.includes(suit) || (deck !== 1 && deck !== 2)) {
    throw new Error(`Invalid card id: ${id}`);
  }
  return { id, joker: false, rank, suit, deck };
}

function isWild(id, wildRank) {
  const c = parseCard(id);
  if (c.joker) return true;
  return wildRank != null && c.rank === wildRank;
}

function cardPoints(id) {
  const c = parseCard(id);
  if (c.joker) return JOKER_POINTS;
  return RANK_POINTS[c.rank];
}

// Wild rank for a given round (1-indexed).
//   rounds 1-8: hand size (3-10) => "3".."9","T"
//   round 9: "J"
//   round 10: "Q"
//   round 11: "K"
//   round 12: "A"
//   round 13: "2"
const HAND_SIZE_BY_ROUND = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const WILD_RANK_BY_ROUND = ["3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A", "2"];

function handSizeForRound(round) {
  return HAND_SIZE_BY_ROUND[round - 1];
}
function wildRankForRound(round) {
  return WILD_RANK_BY_ROUND[round - 1];
}

module.exports = {
  RANKS,
  SUITS,
  RANK_ORDER,
  RANK_POINTS,
  JOKER_POINTS,
  parseCard,
  isWild,
  cardPoints,
  handSizeForRound,
  wildRankForRound,
  HAND_SIZE_BY_ROUND,
  WILD_RANK_BY_ROUND,
};