# Charlotte's Web — Implementation Plan

## Rules (locked)

- **Players:** 2–6. Always 2 standard decks + 4 jokers (108 cards).
- **Rounds:** 13. Hand sizes 3,4,5,6,7,8,9,10,11,12,13,14,15.
- **Wild rank per round:** rounds 1–8 = hand size (3–10); round 9 = J; 10 = Q; 11 = K; 12 = A; 13 = 2. Jokers always wild.
- **Melds:** sets of 3–4 same rank; runs of 3+ same suit. Ace low (A-2-3) or high (Q-K-A), no wrap (K-A-2 illegal).
- **Wilds in melds:** naturals must strictly outnumber wilds (e.g. 2N+1W ok, 2N+2W illegal).
- **Turn:** draw from stock OR top of discard, then discard one.
- **Going out:** all cards in valid melds, must end with a discard. Every other player gets one final turn after that discard.
- **Scoring:** unmelded cards tally per player. 2–10 = face value; J/Q/K = 10; A = 1 (or 15 when A is wild round? — see open Qs); Joker = 50. Player who went out scores 0 for the hand. Running total across 13 hands; lowest wins.

## Architecture

```
Client (TanStack Start)                AWS SAM Backend
─────────────────────────              ─────────────────────
routes/game.$matchId.tsx    ──HTTP──▶  POST /matches/{id}/action  ──▶  Lambda (rules engine)
  polls every 2s            ◀──JSON──  GET  /matches/{id}         ◀──  DynamoDB (Matches)
  useMutation on actions
lib/game/                              backend/src/lib/game/
  types.ts (shared)                      engine.js  (deal, validate, score)
  view.ts (redact opp hands)             melds.js   (set/run + wild rules)
  ui components                          deck.js    (108-card build, shuffle)
```

Server is authoritative. Rules engine is pure JS reused for validation on every action. Match doc holds full state; each `GET /matches/{id}` returns a per-player *view* (opponents' hands redacted to counts).

## Phase 1 — Rules engine + tests (backend, no UI yet)

Files under `backend/src/lib/game/`:

1. **`deck.js`** — build 108-card deck (2×52 + 4 jokers), Fisher-Yates shuffle seeded by matchId+round for reproducibility.
2. **`melds.js`**
   - `isValidSet(cards, wildRank)` — same rank, 3–4 cards, naturals > wilds.
   - `isValidRun(cards, wildRank)` — same suit, consecutive, ace low/high no wrap, naturals > wilds, wilds fill gaps.
   - `validateMelds(melds, hand, wildRank)` — every card used once, each meld valid.
3. **`score.js`** — sum unmelded cards; face/10/50/0-for-goer-out.
4. **`engine.js`** — pure state transitions:
   - `startMatch(players)` → round 1 state.
   - `startRound(state)` → deal `handSize` to each, flip discard, set `wildRank`.
   - `applyAction(state, userId, action)` where action ∈ `draw-stock | draw-discard | discard | lay-down | end-turn`. Returns new state or error.
   - `finalizeRound(state)` after all "one more turn"s → score + advance round or end match.
5. **Tests** — `backend/src/lib/game/__tests__/*.test.js` covering: valid/invalid sets & runs (wild ratio, ace wrap), full-hand scoring, going-out flow with post-out turns, 13-round match progression.

## Phase 2 — Wire into `/matches/{id}/action`

- Rewrite `backend/src/handlers/matches/action.js`: load match, call `engine.applyAction`, `UpdateCommand` with conditional `version` field (optimistic concurrency), return redacted view for caller.
- New `backend/src/handlers/matches/start.js` (POST `/matches/{id}/start`) — creator locks lobby, engine deals round 1.
- Update `create.js` to accept `maxPlayers` (2–6) and set `wildRank: null` until start.
- Update `get.js` to redact opponents' hands.
- Extend `template.yaml` with the `/start` route + function.

Action payload shapes (validated with Zod on backend):
```
{ type: "draw-stock" }
{ type: "draw-discard" }
{ type: "discard", card: "H7" }
{ type: "lay-down", melds: [["H7","H8","H9"], ["SA","S2","S3"]], discard: "DK" }
```

## Phase 3 — Frontend

New files:
- `src/lib/game/types.ts` — shared card/match/action types (mirror backend).
- `src/lib/game/view.ts` — helpers to sort hand, group by suit, detect wild.
- `src/routes/_authenticated.game.$matchId.tsx` — main game screen.
- `src/components/game/`
  - `PlayerStrip.tsx` — opponents around table with hand counts + running scores.
  - `Hand.tsx` — drag-to-reorder, multi-select for melding.
  - `MeldZone.tsx` — staged melds before lay-down.
  - `TableCenter.tsx` — stock pile, discard pile, current wild-rank badge, round indicator.
  - `RoundSummary.tsx` — modal at end of each round with per-player score deltas.
  - `MatchOver.tsx` — final standings.

Data flow:
- `useQuery(["match", id], { refetchInterval: 2000 })` polling.
- `useMutation` for each action → optimistic UI on own hand, invalidate on success.
- Auth via existing `useApi()` (Clerk JWT).

Lobby (`_authenticated.lobby.tsx`) updates:
- Replace disabled "Coming soon" with **Create match** button (opens dialog: game=charlottes-web, max players 2–6).
- Show open matches with **Join** button.
- Creator sees **Start match** once 2+ players joined.

## Technical details

- **Card representation:** two chars — rank (`A23456789TJQK`) + suit (`SHDC`), plus `X1`/`X2`/`X3`/`X4` for the 4 jokers. Deck is an array of unique IDs to disambiguate duplicates across the 2 decks (e.g. `H7a`, `H7b`).
- **Concurrency:** every match doc has `version` int; `UpdateCommand` uses `ConditionExpression: version = :v` and increments. Client retries on 409.
- **Turn timer:** out of scope for v1; add later.
- **Reconnection:** polling handles this for free.
- **AI opponents:** out of scope for v1.

## Open questions (I'll assume defaults unless you object)

1. Ace value when unmelded: **1 point** (matches face-value logic). Confirm you don't want 15.
2. Round where wild rank = A (round 12): natural aces in that round can *only* be used as wilds (they can't also be melded as A-2-3). Standard rummy convention — confirm.
3. Stock exhausted mid-hand: reshuffle the discard pile (leaving the top card) as new stock. Standard.

## Out of scope for this PR

- AI opponents, spectators, chat, turn timers, animations/polish, mobile drag ergonomics, match history/stats persistence to the Stats table (hook up later — engine will emit results, we just won't wire the DynamoDB write yet).

## Deliverables

- Phase 1: engine + passing tests locally (`cd backend/src && npm test`).
- Phase 2: `/start` and `/action` handlers driving real game state end-to-end via `sam local invoke` or a deployed stage.
- Phase 3: playable game route; two browser tabs signed in as different Clerk users can play a full 13-round match.
