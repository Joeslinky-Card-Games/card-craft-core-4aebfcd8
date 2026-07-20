// Client mirror of backend/src/lib/game/cards.js — types and pure helpers only.

export type Suit = "S" | "H" | "D" | "C";
export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "T" | "J" | "Q" | "K";

export type ParsedCard =
  | { id: string; joker: true; rank: null; suit: null; deck: number }
  | { id: string; joker: false; rank: Rank; suit: Suit; deck: number };

export const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K"];
export const RANK_ORDER: Record<Rank, number> = {
  A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, T: 10, J: 11, Q: 12, K: 13,
};
export const RANK_POINTS: Record<Rank, number> = {
  A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, T: 10, J: 10, Q: 10, K: 10,
};
export const JOKER_POINTS = 50;

export function parseCard(id: string): ParsedCard {
  if (typeof id !== "string" || id.length !== 3) throw new Error(`Invalid card id: ${id}`);
  if (id.startsWith("JK")) {
    return { id, joker: true, rank: null, suit: null, deck: Number(id[2]) };
  }
  return { id, joker: false, rank: id[0] as Rank, suit: id[1] as Suit, deck: Number(id[2]) };
}

export function isWild(id: string, wildRank: string | null | undefined): boolean {
  const c = parseCard(id);
  if (c.joker) return true;
  return !!wildRank && c.rank === wildRank;
}

export function cardPoints(id: string): number {
  const c = parseCard(id);
  return c.joker ? JOKER_POINTS : RANK_POINTS[c.rank];
}

export function suitSymbol(s: Suit): string {
  return { S: "♠", H: "♥", D: "♦", C: "♣" }[s];
}

export function rankLabel(r: Rank): string {
  return r === "T" ? "10" : r;
}

export function isRedSuit(s: Suit): boolean {
  return s === "H" || s === "D";
}

// For sorting a hand: group by suit (joker last), then by rank.
export function sortHand(cards: string[], wildRank: string | null | undefined): string[] {
  return cards.slice().sort((a, b) => {
    const pa = parseCard(a);
    const pb = parseCard(b);
    const wa = isWild(a, wildRank) ? 1 : 0;
    const wb = isWild(b, wildRank) ? 1 : 0;
    if (wa !== wb) return wa - wb; // wilds to the right
    if (pa.joker && pb.joker) return pa.deck - pb.deck;
    if (pa.joker) return 1;
    if (pb.joker) return -1;
    const suitOrder: Record<Suit, number> = { S: 0, H: 1, D: 2, C: 3 };
    if (pa.suit !== pb.suit) return suitOrder[pa.suit] - suitOrder[pb.suit];
    // Highest rank first (players can drag to override manually).
    return RANK_ORDER[pb.rank] - RANK_ORDER[pa.rank];
  });
}

export const HAND_SIZE_BY_ROUND = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
export const WILD_RANK_BY_ROUND = ["3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A", "2"];