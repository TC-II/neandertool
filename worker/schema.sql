-- Neandertool leaderboard schema (Cloudflare D1 / SQLite)
CREATE TABLE IF NOT EXISTS scores (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    score      INTEGER NOT NULL,
    date       TEXT    NOT NULL,              -- YYYY-MM-DD
    ip_hash    TEXT,                          -- for rate limiting only
    created_at INTEGER NOT NULL               -- unix ms
);

CREATE INDEX IF NOT EXISTS idx_scores_score ON scores (score DESC);
CREATE INDEX IF NOT EXISTS idx_scores_ip ON scores (ip_hash, created_at);
