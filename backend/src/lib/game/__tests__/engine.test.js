const test = require("node:test");
const assert = require("node:assert/strict");
const { startMatch, startRound, applyAction, finalizeRound, nextRound, currentPlayer, TOTAL_ROUNDS } = require("../engine");
const { handSizeForRound, wildRankForRound } = require("../cards");

test("startMatch requires 2-6 players", () => {
  assert.throws(() => startMatch({ matchId: "m", players: ["a"] }));
  assert.throws(() => startMatch({ matchId: "m", players: ["a","b","c","d","e","f","g"] }));
  const s = startMatch({ matchId: "m", players: ["a", "b"] });
  assert.equal(s.status, "waiting");
  assert.deepEqual(s.scores, { a: 0, b: 0 });
});

test("startRound deals correct hand size and wild rank", () => {
  const m = startMatch({ matchId: "m1", players: ["a", "b", "c"] });
  const s = startRound(m, 1);
  assert.equal(s.handSize, 3);
  assert.equal(s.wildRank, "3");
  assert.equal(s.hands["a"].length, 3);
  assert.equal(s.hands["b"].length, 3);
  assert.equal(s.hands["c"].length, 3);
  assert.equal(s.discard.length, 1);
  assert.equal(s.stock.length, 108 - 3 * 3 - 1);
  assert.equal(s.status, "in-progress");
});

test("round parameters across all 13 rounds", () => {
  for (let r = 1; r <= TOTAL_ROUNDS; r++) {
    assert.equal(typeof handSizeForRound(r), "number");
    assert.equal(typeof wildRankForRound(r), "string");
  }
  assert.equal(handSizeForRound(1), 3);
  assert.equal(handSizeForRound(13), 15);
  assert.equal(wildRankForRound(9), "J");
  assert.equal(wildRankForRound(12), "A");
  assert.equal(wildRankForRound(13), "2");
});

test("draw then discard advances turn", () => {
  const m = startMatch({ matchId: "m2", players: ["a", "b"] });
  const s = startRound(m, 1);
  const first = currentPlayer(s);
  applyAction(s, first, { type: "draw-stock" });
  const toDiscard = s.hands[first][0];
  applyAction(s, first, { type: "discard", card: toDiscard });
  assert.notEqual(currentPlayer(s), first);
});

test("cannot discard without drawing", () => {
  const m = startMatch({ matchId: "m3", players: ["a", "b"] });
  const s = startRound(m, 1);
  const first = currentPlayer(s);
  assert.throws(() => applyAction(s, first, { type: "discard", card: s.hands[first][0] }));
});

test("cannot act on someone else's turn", () => {
  const m = startMatch({ matchId: "m4", players: ["a", "b"] });
  const s = startRound(m, 1);
  const other = s._order.find((p) => p !== currentPlayer(s));
  assert.throws(() => applyAction(s, other, { type: "draw-stock" }));
});

test("go-out flow: opponents get one more turn then round finalizes", () => {
  const m = startMatch({ matchId: "m5", players: ["a", "b", "c"] });
  const s = startRound(m, 1);
  // manually stage: player a has a valid 3-card set + 1 to discard
  const first = s._order[0];
  s.hands[first] = ["7H1", "7S1", "7D1", "KC1"];
  s.hasDrawn = true; // pretend they drew
  s.turn = 0;
  applyAction(s, first, {
    type: "lay-down",
    melds: [["7H1", "7S1", "7D1"]],
    discard: "KC1",
  });
  assert.equal(s.goneOutBy, first);
  // 2 opponents still to play
  assert.equal(s.remainingFinalTurns, 2);
  // each remaining player draws + discards
  for (let i = 0; i < 2; i++) {
    const cp = currentPlayer(s);
    applyAction(s, cp, { type: "draw-stock" });
    const card = s.hands[cp][0];
    applyAction(s, cp, { type: "discard", card });
  }
  assert.equal(s.status, "round-complete");
  assert.equal(s.lastRoundScores[first], 0);
});

test("nextRound advances to round 2 with new wild rank", () => {
  const m = startMatch({ matchId: "m6", players: ["a", "b"] });
  let s = startRound(m, 1);
  s.goneOutBy = "a";
  s.remainingFinalTurns = 0;
  s.hands["a"] = [];
  finalizeRound(s);
  assert.equal(s.status, "round-complete");
  s = nextRound(s);
  assert.equal(s.round, 2);
  assert.equal(s.handSize, 4);
  assert.equal(s.wildRank, "4");
});