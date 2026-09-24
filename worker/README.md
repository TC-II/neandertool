# Leaderboard API

Cloudflare Worker + D1 (SQLite). Free tier, never sleeps.

| Method | Path      | Body                | Response                     |
|--------|-----------|---------------------|------------------------------|
| GET    | `/scores` | —                   | top 10 `[{name,score,date}]` |
| POST   | `/scores` | `{ name, score }`   | `201` / `400` / `429`        |

Server-side checks: name 1–12 chars (uppercased, `<>` and control chars stripped),
integer score in `1..10,000,000`, one submission per IP every 15 s.

## Deploy (first time)

```bash
cd worker
npx wrangler login
npx wrangler d1 create neandertool-leaderboard   # copy database_id into wrangler.toml
npx wrangler d1 execute neandertool-leaderboard --remote --file=schema.sql
npx wrangler deploy                              # prints https://neandertool-leaderboard.<you>.workers.dev
```

Then set `LEADERBOARD_URL` in `js/game.js` to the printed URL.

## Migrate old Supabase scores (optional)

```bash
SUPABASE_KEY=<anon key> node migrate-from-supabase.mjs > seed.sql
npx wrangler d1 execute neandertool-leaderboard --remote --file=seed.sql
```

## Moderation

```bash
npx wrangler d1 execute neandertool-leaderboard --remote --command "SELECT id,name,score,date FROM scores ORDER BY score DESC LIMIT 20"
npx wrangler d1 execute neandertool-leaderboard --remote --command "DELETE FROM scores WHERE id = 123"
```

## Local dev

```bash
npx wrangler d1 execute neandertool-leaderboard --local --file=schema.sql
npx wrangler dev          # http://localhost:8787
```
