-- migrations/0002_leaderboard.sql

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  display_name TEXT NOT NULL,
  email_verified_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE field_journals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  streak INTEGER NOT NULL,
  total_score INTEGER NOT NULL,
  filter_hash TEXT NOT NULL,
  filter_label TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE sightings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  journal_id TEXT NOT NULL REFERENCES field_journals(id),
  round_index INTEGER NOT NULL,
  taxon_id INTEGER,
  taxon_name TEXT NOT NULL,
  distance_km REAL NOT NULL,
  score INTEGER NOT NULL,
  hints_used INTEGER NOT NULL,
  passed INTEGER NOT NULL
);

CREATE INDEX idx_journals_streak ON field_journals(streak DESC);
CREATE INDEX idx_journals_total ON field_journals(total_score DESC);
CREATE INDEX idx_journals_daily ON field_journals(created_at);
CREATE INDEX idx_journals_user ON field_journals(user_id);
CREATE INDEX idx_sightings_journal ON sightings(journal_id);
