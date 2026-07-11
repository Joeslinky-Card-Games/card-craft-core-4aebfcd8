# Card Game Platform — AWS SAM Backend

Serverless backend for the card game platform. AWS SAM deploys API Gateway + Lambda + DynamoDB.

## Stack

- **API Gateway** (HTTP API) — public REST-ish API at `/games`, `/matches`, `/stats`, `/profile`
- **Lambda** (Node.js 20) — one handler per route
- **DynamoDB** — 3 tables: `Users`, `Matches`, `Stats`
- **Auth** — Clerk JWT verification via JWKS (networkless per-invocation cache)

## Tables

| Table    | PK               | SK          | GSI                                    |
| -------- | ---------------- | ----------- | -------------------------------------- |
| Users    | `userId` (S)     | —           | —                                      |
| Matches  | `matchId` (S)    | —           | `byStatus` (status, createdAt)         |
| Stats    | `userId` (S)     | `gameId`(S) | `byGame` (gameId, rating)              |

## Routes

```
GET    /games                    public   list games
GET    /games/{gameId}           public   game details

GET    /matches                  public   list open matches (lobby)
POST   /matches                  auth     create match
GET    /matches/{matchId}        auth     get match state
POST   /matches/{matchId}/join   auth     join match
POST   /matches/{matchId}/action auth     play a move

GET    /profile                  auth     current user profile
PUT    /profile                  auth     update profile

GET    /stats/me                 auth     current user stats
GET    /stats/leaderboard        public   top players (by game)
```

## Env vars (Lambda)

Sourced from GitHub Actions secrets → SAM parameters at deploy time:

- `CLERK_ISSUER` — e.g. `https://your-app.clerk.accounts.dev`
- `CLERK_AUDIENCE` — optional; JWT `aud` claim

DynamoDB table names are injected via SAM automatically.

## Deploy locally

```
cd backend
sam build
sam deploy --guided \
  --parameter-overrides \
    ClerkIssuer=$CLERK_ISSUER \
    ClerkAudience=$CLERK_AUDIENCE
```

## CI / CD

`.github/workflows/deploy-backend.yml` deploys on push to `main`. Required
GitHub repository secrets:

- `AWS_ROLE_ARN` — OIDC role SAM assumes to deploy
- `AWS_REGION` — e.g. `us-east-1`
- `CLERK_ISSUER`
- `CLERK_AUDIENCE` (optional)

After deploy, wire the API URL into the frontend by setting
`VITE_API_URL` in Vercel to the API Gateway invoke URL from the stack
outputs.