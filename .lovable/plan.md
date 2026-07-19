## Scope

1. **Remove Backfill button** from the Leaderboard UI (keep the endpoint, just hide the control).
2. **Confirm leaderboards are per-game** — the Leaderboard already queries by `gameId`; verify the lobby switches it when the selected game changes and each game gets its own ranking.
3. **Add a Skip-Bo–style game** — new game entry in the catalog, new game engine, new match view, wired into the existing lobby/match flow.

## Naming & branding

Rename the game to **"Stack Attack"** (Skip-Bo clone, distinct name).
Wild cards renamed **"WILD"** badges (not "SKIP-BO").

## Card design

Custom Stack Attack card face — different from the rummy playing-card face:
- Rounded-square face, thick 2-color border, oversized centered numeral (1–12).
- Numerals in a heavy geometric display font (Space Grotesk / Bricolage) with a subtle drop-shadow.
- Each number tier gets a color band (1–4 teal, 5–8 amber, 9–12 magenta) so stacks read at a glance.
- Wild card: holographic gradient face with a "★ WILD" wordmark and no number.
- Card back: dark navy with a diagonal stripe motif and small "SA" monogram.

## Game rules (Stack Attack)

- 162-card deck: 12 copies of each rank 1–12 + 18 Wilds.
- 2–6 players. Each player deals a **Stockpile** of 20 (2p) / 15 (3–4p) / 10 (5–6p) cards, top card face-up.
- On your turn: draw up to 5 cards in hand. Play cards onto shared **Build piles** in strict 1→12 sequence (Wild = any next value). Play from hand, stockpile top, or your 4 personal **Discard piles**. Completed 1–12 build pile is cleared back to a completed pile. Turn ends by discarding one card from hand onto any of your 4 discard piles.
- First to empty their Stockpile wins the round; match = configurable rounds (default 1).

## Backend changes

- `backend/src/lib/games.js`: add `stack-attack` entry, `status: "available"`.
- New engine module `backend/src/lib/stackattack/` with:
  - `deck.js` – build/shuffle 162-card deck (uses existing `mulberry32`).
  - `engine.js` – `createMatch`, `startRound`, `applyAction` (play-from-hand/stock/discard, end-turn, draw-refill), win detection.
  - `view.js` – per-player redaction (hide opponents' hand + face-down stock body, show stock-top + discard tops + build piles + counts).
  - `ai.js` – basic greedy bot (prefer stock-top plays, then discard-top, then hand; discard non-wilds to balanced piles).
- Route the existing match handlers (`create`, `action`, `ai-step`, `view`, `next-round`, `play-again`) through a per-game dispatcher keyed on `match.gameId`; rummy code moves untouched behind the dispatcher.
- Stats: reuse `stats.js` — record `gamesPlayed`/`gamesWon` per `gameId` so leaderboards stay separate.

## Frontend changes

- Lobby: existing game picker already lists catalog entries; Stack Attack becomes selectable when `status === "available"`. Leaderboard already re-queries on `gameId` change — no change needed once #1 is done.
- New route `src/routes/_authenticated.match.$matchId.tsx` currently branches on rummy; introduce a game-typed router component that renders either the existing rummy `MatchView` or a new `StackAttackView`.
- New components under `src/components/stackattack/`:
  - `Card.tsx` – card face using the design above (semantic tokens for the 3 tier colors + wild gradient added to `src/styles.css`).
  - `BuildPile.tsx`, `DiscardPile.tsx`, `Stockpile.tsx`, `Hand.tsx`.
  - `StackAttackView.tsx` – table layout: 4 build piles centered, seats around, own hand + 4 discard piles + stockpile at bottom.
- Reuse existing chat, rules dialog (rewritten copy), play-again voting, seating logic.

## Files touched (high level)

```text
backend/
  src/lib/games.js                            (add stack-attack)
  src/lib/stackattack/{deck,engine,view,ai}.js (new)
  src/lib/matchDispatcher.js                  (new, routes by gameId)
  src/handlers/matches/{create,action,ai-step,view,next-round,play-again}.js (dispatch)
src/
  styles.css                                  (stack-attack color tokens)
  routes/_authenticated.match.$matchId.tsx    (game-typed router)
  components/stackattack/*                    (new)
  components/lobby/Leaderboard.tsx            (remove Backfill button)
  components/game/RulesDialog.tsx             (per-game rules text)
```

## Not included

- Fancy Skip-Bo tournament formats, chat moderation changes, mobile-only polish beyond what the layout naturally provides.
- Deleting the backfill endpoint — only the UI button is hidden so you can still hit it manually if needed.

## Open question

Confirm the name **"Stack Attack"** works, or tell me another; I'll swap it before implementing.
