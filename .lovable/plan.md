## Goal

Support **private tables secured with a password**, replace the always-visible open-tables list on the lobby with a **Join table** dialog, and give a player who accidentally left a table a way to **rejoin** it.

## Backend (AWS SAM / DynamoDB)

Match record gains two optional fields:
- `visibility`: `"public" | "private"` (default `"public"`)
- `passwordHash`: sha-256 hex digest of the password, only set when private. Never returned by any endpoint.

Handler changes in `backend/src/handlers/matches/`:

1. `create.js`
   - Accept `visibility` and `password` in the body.
   - When `visibility === "private"`, require a 4–64 char password, store `sha256(password)` as `passwordHash`, and stamp `visibility = "private"`.
   - Strip `passwordHash` before returning the record.

2. `join.js`
   - Read the match first, verify `visibility`. If private, require `password` in body and compare `sha256(password)` to `passwordHash` before running the existing conditional `UpdateCommand`. Return `401` on mismatch.
   - Return the record with `passwordHash` stripped.
   - Also allow re-entering when the player is already in `players` (idempotent → return the match, no update).

3. `list.js`
   - Filter out matches where `visibility === "private"` from the public "open" query. Private tables should never appear in the browse list.

4. New `mine.js` handler + `GET /matches/mine` route in `template.yaml`
   - Auth-required. Scans (or queries the `byStatus` GSI for each status) and filters to matches where `players` contains the caller's `userId` and `status !== "complete"`. Returns `{ matches: [...] }` with `passwordHash` stripped.
   - This is what powers the "Your tables" rejoin list.

Shared helper in `backend/src/lib/matches.js`:
- `stripSecret(match)` — clone and delete `passwordHash`.
- `hashPassword(pw)` — `crypto.createHash("sha256").update(pw, "utf8").digest("hex")`.

Password rule (server-enforced): trim, min 4, max 64 characters.

## Frontend

### `src/lib/api.ts`
- Extend `Match` with `visibility?: "public" | "private"`.
- Add:
  - `endpoints.myMatches()` → `GET /matches/mine`.
  - Payloads for create (`{ gameId, maxPlayers, visibility?, password? }`) and join (`{ password? }` via POST body).

### `src/routes/_authenticated.lobby.tsx`

Remove the inline "Open tables" list entirely. Replace the single "Create table" per-game section with two top-level actions:

```text
[  Your tables (N)  ]     [ Join table ]
                                       ▲ opens JoinDialog
   Game grid → each card has "Create table"
```

1. **Your tables** section (only shown when the query returns matches)
   - Data: `useQuery(["matches", "mine"], endpoints.myMatches)` with a 5s refetch.
   - Renders each active match with game name, player count, status, and an **Enter** button that navigates to `/match/$matchId`. This is the accidental-leave rejoin path.

2. **Create table dialog** (extends the existing modal)
   - Adds a `Visibility` toggle: `Public | Private`.
   - When Private, reveal a `Password` input (min 4 chars) and a hint "Share this password with players you invite."
   - On submit, passes `visibility` and `password` to the create mutation.

3. **New JoinDialog** (opened by "Join table")
   - Two tabs:
     - **Browse open tables** — the previous open-matches list, unchanged in behavior (public matches only).
     - **Join by ID** — two inputs: `Table ID` (UUID) and `Password` (optional; required if the table is private). Submit calls `POST /matches/{id}/join` with `{ password }`.
   - Shows the server error message on 401/403 (e.g. "Incorrect password", "Table is full").

### `src/components/site-header.tsx` (small polish)
- Add a `Lobby` link if not already there so the rejoin path is one click from anywhere. (No-op if it already exists.)

## Security notes

- Passwords are hashed on the server before storage; the client never receives the hash.
- Password comparison uses a fixed-length hex digest so a `timingSafeEqual` compare is straightforward; length is not sensitive since digests are always 64 chars.
- Private matches are excluded from `GET /matches?status=open`, so a private table can only be joined by someone who knows the `matchId` **and** the password.
- Zod-style validation on both client and server: password 4–64 chars, `matchId` must match a UUID regex before the join call.

## Out of scope

- No "leave table" action yet — the rejoin flow already covers accidental navigation away. A dedicated leave action can come later.
- No password rotation or per-user invite links; the shared password is the gate.

## File touch list

Backend
- `backend/src/handlers/matches/create.js` (edit)
- `backend/src/handlers/matches/join.js` (edit)
- `backend/src/handlers/matches/list.js` (edit)
- `backend/src/handlers/matches/mine.js` (new)
- `backend/src/lib/matches.js` (new — `hashPassword`, `stripSecret`)
- `backend/template.yaml` (new `GET /matches/mine` route + function)

Frontend
- `src/lib/api.ts` (types + `myMatches`, extended create/join payloads)
- `src/routes/_authenticated.lobby.tsx` (rewrite lobby layout, add dialogs)
- `src/components/lobby/JoinDialog.tsx` (new)
- `src/components/lobby/CreateTableDialog.tsx` (new — extracted from the current inline modal, adds visibility/password)
