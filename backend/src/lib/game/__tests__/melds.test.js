const test = require("node:test");
const assert = require("node:assert/strict");
const { validateSet, validateRun, validateGoingOut } = require("../melds");

test("valid set of 3 same rank", () => {
  assert.equal(validateSet(["7H1", "7S1", "7D1"], "3"), true);
});

test("set with duplicate deck cards allowed", () => {
  assert.equal(validateSet(["7H1", "7H2", "7D1"], "3"), true);
});

test("set of 5 rejected", () => {
  assert.equal(validateSet(["7H1", "7S1", "7D1", "7C1", "7H2"], "3"), false);
});

test("set with too many wilds rejected", () => {
  // 2 naturals + 2 wilds = not strictly greater
  assert.equal(validateSet(["7H1", "7S1", "JK1", "JK2"], "3"), false);
});

test("set of wild-rank naturals allowed (wild-rank card as natural)", () => {
  // 3 sevens, wildRank=7. Treated as naturals: valid set of 7s.
  assert.equal(validateSet(["7H1", "7S1", "7D1"], "7"), true);
});

test("3-3-Joker on round 1 valid (3s as naturals, joker wild)", () => {
  assert.equal(validateSet(["3H1", "3S1", "JK1"], "3"), true);
});

test("valid run A-2-3", () => {
  assert.equal(validateRun(["AH1", "2H1", "3H1"], "K"), true);
});

test("valid run Q-K-A (high ace)", () => {
  assert.equal(validateRun(["QH1", "KH1", "AH1"], "2"), true);
});

test("run wrap K-A-2 rejected", () => {
  assert.equal(validateRun(["KH1", "AH1", "2H1"], "5"), false);
});

test("run with wild filling gap", () => {
  // 5H, JK, 7H — wild fills 6H slot
  assert.equal(validateRun(["5H1", "JK1", "7H1"], "K"), true);
});

test("run with too many wilds rejected", () => {
  assert.equal(validateRun(["5H1", "JK1", "JK2"], "K"), false);
});

test("run wrong suit rejected", () => {
  assert.equal(validateRun(["5H1", "6S1", "7H1"], "K"), false);
});

test("run: wild-rank card may be used as natural or wild", () => {
  // 5H-6H-7H with wildRank=6: valid either way (6H as natural at slot 6, or as wild).
  assert.equal(validateRun(["5H1", "6H1", "7H1"], "6"), true);
  // 5H-6H1-6H2, wildRank=6: 6H1 as natural at slot 6, 6H2 as wild at slot 7 → valid.
  assert.equal(validateRun(["5H1", "6H1", "6H2"], "6"), true);
  // Only wilds (both jokers + one wild-rank card as wild) still rejected when naturals not majority.
  assert.equal(validateRun(["6H1", "JK1", "JK2"], "6"), false);
});

test("going out requires exact hand coverage", () => {
  const hand = ["7H1", "7S1", "7D1", "5H1", "6H1", "8H1", "KC1"];
  const melds = [["7H1", "7S1", "7D1"], ["5H1", "6H1", "8H1"]];
  // wait 5-6-8 has a gap without wilds; that's invalid. Fix meld:
  const meldsOk = [["7H1", "7S1", "7D1"], ["5H1", "6H1", "JK1"]];
  const handWithWild = ["7H1", "7S1", "7D1", "5H1", "6H1", "JK1", "KC1"];
  assert.equal(validateGoingOut(meldsOk, handWithWild, "KC1", "2").ok, true);
  assert.equal(validateGoingOut(melds, hand, "KC1", "2").ok, false);
});