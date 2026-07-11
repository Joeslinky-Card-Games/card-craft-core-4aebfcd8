// Client mirror of backend/src/lib/game/melds.js — validation + auto-arrange solver.
import { parseCard, RANK_ORDER, cardPoints, type ParsedCard } from "./cards";

function forEachClassification(
  cards: string[],
  wildRank: string | null | undefined,
  cb: (wilds: ParsedCard[], naturals: ParsedCard[]) => boolean,
): boolean {
  const parsed = cards.map(parseCard);
  const flex: number[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const c = parsed[i];
    if (!c.joker && wildRank && c.rank === wildRank) flex.push(i);
  }
  const n = flex.length;
  for (let mask = 0; mask < 1 << n; mask++) {
    const wilds: ParsedCard[] = [];
    const naturals: ParsedCard[] = [];
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

function setShape(wilds: ParsedCard[], naturals: ParsedCard[]): boolean {
  if (naturals.length <= wilds.length) return false;
  const ranks = new Set(naturals.map((c) => (c.joker ? "" : c.rank)));
  return ranks.size === 1;
}

function runShape(wilds: ParsedCard[], naturals: ParsedCard[], L: number): boolean {
  if (naturals.length <= wilds.length) return false;
  const suits = new Set(naturals.map((c) => (c.joker ? "" : c.suit)));
  if (suits.size !== 1) return false;
  const fixed: number[] = [];
  let aceCount = 0;
  const seen = new Set<number>();
  for (const c of naturals) {
    if (c.joker) continue;
    if (c.rank === "A") { aceCount++; continue; }
    const p = RANK_ORDER[c.rank];
    if (seen.has(p)) return false;
    seen.add(p);
    fixed.push(p);
  }
  for (let start = 1; start + L - 1 <= 14; start++) {
    const end = start + L - 1;
    const used = new Set<number>();
    let ok = true;
    for (const p of fixed) {
      if (p < start || p > end || used.has(p)) { ok = false; break; }
      used.add(p);
    }
    if (!ok) continue;
    const aceSlots: number[] = [];
    if (1 >= start && 1 <= end && !used.has(1)) aceSlots.push(1);
    if (14 >= start && 14 <= end && !used.has(14)) aceSlots.push(14);
    if (aceCount > aceSlots.length) continue;
    for (let i = 0; i < aceCount; i++) used.add(aceSlots[i]);
    if (L - used.size === wilds.length) return true;
  }
  return false;
}

export function validateSet(cards: string[], wildRank: string | null | undefined): boolean {
  if (cards.length < 3 || cards.length > 4) return false;
  if (new Set(cards).size !== cards.length) return false;
  return forEachClassification(cards, wildRank, (w, n) => setShape(w, n));
}

export function validateRun(cards: string[], wildRank: string | null | undefined): boolean {
  if (cards.length < 3) return false;
  if (new Set(cards).size !== cards.length) return false;
  const L = cards.length;
  return forEachClassification(cards, wildRank, (w, n) => runShape(w, n, L));
}

export function validateMeld(cards: string[], wildRank: string | null | undefined): boolean {
  return validateSet(cards, wildRank) || validateRun(cards, wildRank);
}

// -------- Auto-arrange solver --------

function combinations(arr: number[], k: number): number[][] {
  const out: number[][] = [];
  const cur: number[] = [];
  const rec = (start: number) => {
    if (cur.length === k) { out.push(cur.slice()); return; }
    for (let i = start; i <= arr.length - (k - cur.length); i++) {
      cur.push(arr[i]); rec(i + 1); cur.pop();
    }
  };
  rec(0);
  return out;
}

/**
 * Try to partition `hand` (minus one discard) into valid melds.
 * Returns { melds, discard } if a full lay-down exists, else null.
 * Also returns a best-effort partial arrangement (max cards covered)
 * for staging assistance.
 */
export function autoArrange(
  hand: string[],
  wildRank: string | null | undefined,
): { melds: string[][]; discard: string | null; complete: boolean } {
  const n = hand.length;
  if (n === 0) return { melds: [], discard: null, complete: false };

  // Enumerate candidate melds up to size min(n, 8) as index bitmasks.
  const indices = hand.map((_, i) => i);
  const candidates: { mask: number; cards: string[] }[] = [];
  const maxSize = Math.min(n, 8);
  for (let k = 3; k <= maxSize; k++) {
    for (const combo of combinations(indices, k)) {
      const cards = combo.map((i) => hand[i]);
      if (validateMeld(cards, wildRank)) {
        let mask = 0;
        for (const i of combo) mask |= 1 << i;
        candidates.push({ mask, cards });
      }
    }
  }

  // Try each discard candidate (prefer highest-point card as discard tie-breaker).
  const discardOrder = [...indices].sort((a, b) => cardPoints(hand[b]) - cardPoints(hand[a]));

  for (const d of discardOrder) {
    const target = ((1 << n) - 1) ^ (1 << d);
    const covered = cover(target, candidates);
    if (covered) {
      return { melds: covered.map((m) => m.cards), discard: hand[d], complete: true };
    }
  }

  // No complete lay-down. Return best partial: greedy — pick largest meld repeatedly.
  const sortedCands = [...candidates].sort((a, b) => popcount(b.mask) - popcount(a.mask));
  const usedMask = { v: 0 };
  const picked: { mask: number; cards: string[] }[] = [];
  for (const c of sortedCands) {
    if ((c.mask & usedMask.v) === 0) {
      picked.push(c);
      usedMask.v |= c.mask;
    }
  }
  return { melds: picked.map((m) => m.cards), discard: null, complete: false };
}

function popcount(x: number): number {
  let c = 0;
  while (x) { x &= x - 1; c++; }
  return c;
}

function cover(
  target: number,
  candidates: { mask: number; cards: string[] }[],
): { mask: number; cards: string[] }[] | null {
  // Restrict to candidates fitting inside target.
  const usable = candidates.filter((c) => (c.mask & ~target) === 0);
  if (usable.length === 0) return target === 0 ? [] : null;
  // DFS on lowest remaining bit.
  const memo = new Set<number>();
  const stack: { rem: number; picked: number[] }[] = [{ rem: target, picked: [] }];
  while (stack.length) {
    const { rem, picked } = stack.pop()!;
    if (rem === 0) return picked.map((i) => usable[i]);
    if (memo.has(rem)) continue;
    memo.add(rem);
    const lowBit = rem & -rem;
    for (let i = 0; i < usable.length; i++) {
      const cand = usable[i];
      if ((cand.mask & lowBit) !== 0 && (cand.mask & rem) === cand.mask) {
        stack.push({ rem: rem ^ cand.mask, picked: [...picked, i] });
      }
    }
  }
  return null;
}