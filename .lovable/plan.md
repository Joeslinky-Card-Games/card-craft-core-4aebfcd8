# Average runtime + lobby redesign

Two connected changes: (1) track how long completed matches actually take and expose an average per game + player count; (2) turn the lobby into a set of game tiles that open a per-game menu (info, leaderboard, create, join).

## 1. Backend — runtime tracking

**Capture start/end timestamps on the match record.**
- `backend/src/handlers/matches/start.js`: set `startedAt = new Date().toISOString()` when transitioning `open → in-progress`.
- `backend/src/handlers/matches/play-again.js`: same, since it rehydrates the match.
- Wherever a match transitions to `status === "complete"` (action.js, next-round.js, ai-step.js), stamp `completedAt` before the final Put. Guard with `!match.completedAt` so we don't overwrite.

**Aggregate into the existing `stats` table under a special key.**
- Add `backend/src/lib/runtime-stats.js` with `recordCompletedMatch(match)` that:
  - Skips if no `startedAt`/`completedAt`.
  - Computes `durationMs = completedAt - startedAt`, `players = match.players.length`.
  - Uses a fixed synthetic userId like `__runtime__` with `gameId = match.gameId` as the stats row, and an inner map keyed by player count: `byPlayers.{n}.totalMs`, `byPlayers.{n}.count`. Update with `ADD` expressions.
- Call it once from the same spot that already invokes `recordMatchCompletion` in `action.js`, `next-round.js`, `ai-step.js`.
- Extend `backfill-stats.js` similarly (only for matches that have `startedAt`+`completedAt`; older matches will just be skipped).

**New endpoint `GET /games/{gameId}/runtime`.**
- `backend/src/handlers/games/runtime.js`: reads the `__runtime__` row for that gameId and returns `{ gameId, byPlayers: { "2": { avgMs, count }, ... }, overallAvgMs, totalCount }`.
- Wire route in `backend/template.yaml`.

## 2. Frontend — data + types

- `src/lib/api.ts`: add `RuntimeStats` type and `endpoints.runtime(gameId)`.
- Helper `formatDuration(ms, playerCount?)` in a small util that picks the closest player-count bucket (exact match, else nearest with data, else overall) and returns e.g. `"~18 min"`.

## 3. Frontend — lobby redesign

Rework `src/routes/_authenticated.lobby.tsx`:

- Top of page: greeting + "Join by code" button (unchanged) + "Your tables" list (unchanged).
- Remove the standalone `<Leaderboard />` block from the lobby.
- Games grid becomes the primary content. Each card shows:
  - Game name, short description
  - Player range
  - Estimated runtime chip (`~18 min · 4 players` — falls back to `"—"` when no data)
  - Status badge (available / coming soon)
  - Click behavior: available → open `GameMenuDialog`; coming-soon → disabled.

New component `src/components/lobby/GameMenuDialog.tsx` (shadcn `Dialog`):
- Header: game name, description, player range, avg runtime.
- Tabs (shadcn `Tabs`): **Play** | **Leaderboard** | **How to play**.
  - **Play**: two big actions — "Create table" (opens existing `CreateTableDialog`) and "Join table" (opens existing `JoinDialog` prefiltered to this game). Also shows any of the user's active tables for this game with a "Rejoin" button.
  - **Leaderboard**: reuses existing `Leaderboard` component but locked to this `gameId` (add optional `gameId` prop that, when set, hides the picker).
  - **How to play**: pulls text from the existing `RulesDialog` content. Refactor `RulesDialog` to export a `RulesContent({ gameId })` component; both the in-match dialog and this tab render it.

## 4. Files touched

```text
backend/src/handlers/matches/start.js          + startedAt
backend/src/handlers/matches/play-again.js     + startedAt reset
backend/src/handlers/matches/action.js         + completedAt + runtime record
backend/src/handlers/matches/next-round.js     + completedAt + runtime record
backend/src/handlers/matches/ai-step.js        + completedAt + runtime record
backend/src/handlers/matches/backfill-stats.js + runtime backfill
backend/src/handlers/games/runtime.js          NEW
backend/src/lib/runtime-stats.js               NEW
backend/template.yaml                          + route + function
src/lib/api.ts                                 + runtime types/endpoint
src/lib/format.ts                              NEW (formatDuration helper)
src/components/lobby/GameMenuDialog.tsx        NEW
src/components/lobby/Leaderboard.tsx           accept optional gameId prop
src/components/game/RulesDialog.tsx            export RulesContent
src/routes/_authenticated.lobby.tsx            redesigned around tiles
```

## Notes / trade-offs

- Runtime aggregation uses a single synthetic stats row per game to avoid a new table. If you'd rather have its own DynamoDB table I can do that instead.
- Old completed matches have no `startedAt`, so early averages will be based only on new games until backfill (which can only help matches that already had both timestamps — we can't invent them).
- Player-count bucketing is exact match with a fallback to overall average, which keeps the UI honest when only some player counts have data.