const { RANKS, SUITS } = require("./cards");

function buildDeck() {
  const cards = [];
  for (const deck of [1, 2]) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push(`${rank}${suit}${deck}`);
      }
    }
  }
  for (let i = 1; i <= 4; i++) cards.push(`JK${i}`);
  return cards; // 2*52 + 4 = 108
}

// mulberry32 PRNG for reproducible shuffles.
function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffle(cards, seedInput) {
  const rng =
    typeof seedInput === "number"
      ? makeRng(seedInput)
      : typeof seedInput === "string"
      ? makeRng(hashSeed(seedInput))
      : Math.random;
  const arr = cards.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

module.exports = { buildDeck, shuffle, hashSeed };