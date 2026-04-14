# Field Journal Leaderboard Design

## Overview

Add a global leaderboard to LifeGuesser using Cloudflare D1, with optional email verification via magic links (Resend).

## Goals

- Track and display top players by streak and total score
- Support anonymous play with optional email verification
- Show filter context ("Birds · North America") as tags on entries
- Enable future features: replays, achievements, analytics

## Data Model

### D1 Schema

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,              -- UUID from localStorage
  email TEXT UNIQUE,                -- null until verified
  display_name TEXT NOT NULL,       -- chosen nickname
  email_verified_at INTEGER,        -- timestamp when magic link confirmed
  created_at INTEGER NOT NULL
);

CREATE TABLE field_journals (
  id TEXT PRIMARY KEY,              -- UUID
  user_id TEXT NOT NULL REFERENCES users(id),
  streak INTEGER NOT NULL,
  total_score INTEGER NOT NULL,
  filter_hash TEXT NOT NULL,
  filter_label TEXT NOT NULL,       -- "Birds · North America"
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
  passed INTEGER NOT NULL           -- 0/1
);

CREATE INDEX idx_journals_streak ON field_journals(streak DESC);
CREATE INDEX idx_journals_total ON field_journals(total_score DESC);
CREATE INDEX idx_journals_daily ON field_journals(created_at);
CREATE INDEX idx_sightings_journal ON sightings(journal_id);
```

### KV Storage

Magic link tokens stored with TTL:
- Key: `magic:{token}`
- Value: `userId`
- TTL: 900 seconds (15 minutes)

## Auth Flow

1. **First visit**: Generate UUID client-side, store in localStorage
2. **Registration**: POST to `/api/auth/register` with nickname → creates `users` row
3. **Play**: Scores saved under UUID (no email required)
4. **Optional verification**: User enters email → magic link sent via Resend
5. **Verification**: Click link → GET `/api/auth/verify?token=xxx` → sets `email_verified_at`
6. **Recovery**: Verified users can reclaim identity on new devices via email

### Magic Link Email

- From: `noreply@sahil.pro` (or similar)
- Subject: "Verify your LifeGuesser identity"
- Link: `https://{host}/api/auth/verify?token={token}`

## Leaderboard

### Rankings

Two separate views:
- **Streak**: Longest consecutive rounds survived
- **Total Score**: Sum of all round scores in expedition

### Time Windows

- **All-time**: Best scores ever
- **Daily**: Past 24 hours (rolling)

### Display

- Top 10 entries per view
- Each entry shows: rank, nickname, score, filter tags, verified badge (✓)
- Below list: "Your rank: #42" (user's position even if not in top 10)

### Queries

```sql
-- Top 10 by streak (all-time)
SELECT u.display_name, u.email_verified_at, j.streak, j.filter_label
FROM field_journals j
JOIN users u ON j.user_id = u.id
ORDER BY j.streak DESC
LIMIT 10;

-- Top 10 by streak (daily)
SELECT u.display_name, u.email_verified_at, j.streak, j.filter_label
FROM field_journals j
JOIN users u ON j.user_id = u.id
WHERE j.created_at > :twentyFourHoursAgo
ORDER BY j.streak DESC
LIMIT 10;

-- User's rank
SELECT COUNT(*) + 1 as rank
FROM field_journals
WHERE streak > (SELECT MAX(streak) FROM field_journals WHERE user_id = :userId);
```

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/auth/register` | Create user with nickname, returns userId |
| POST | `/api/auth/send-magic-link` | Send verification email |
| GET | `/api/auth/verify` | Confirm magic link token |
| GET | `/api/auth/me` | Get current user info |
| POST | `/api/journal` | Submit completed expedition |
| GET | `/api/leaderboard` | Fetch rankings |

### Request/Response Examples

**POST /api/auth/register**
```json
// Request
{ "nickname": "NaturalistNick" }

// Response
{ "userId": "uuid-here", "displayName": "NaturalistNick" }
```

**POST /api/journal**
```json
// Request
{
  "userId": "uuid-here",
  "streak": 7,
  "totalScore": 24500,
  "filterHash": "abc123",
  "filterLabel": "Birds · North America",
  "rounds": [
    { "roundIndex": 0, "taxonId": 123, "taxonName": "Blue Jay", "distanceKm": 45.2, "score": 3800, "hintsUsed": 1, "passed": true },
    ...
  ]
}

// Response
{ "journalId": "uuid", "rank": { "streak": 42, "totalScore": 38 } }
```

**GET /api/leaderboard?type=streak&window=daily**
```json
{
  "type": "streak",
  "window": "daily",
  "entries": [
    { "rank": 1, "displayName": "Explorer", "value": 15, "filterLabel": "All · World", "verified": true },
    ...
  ],
  "userRank": 42,
  "userValue": 7
}
```

## UI Changes

### New Page: `/leaderboard`

- Header with tabs: Streak | Total Score
- Toggle: All-time | Daily
- Leaderboard list (top 10)
- User's rank card at bottom
- Link to verify email if not verified

### Leaderboard Entry Component

```
#1  🏆 NaturalistNick ✓     15 streak    Birds · North America
```

- Rank with medal icons for top 3
- Nickname with verified badge
- Score value
- Filter tags (muted)

### Game Over Integration

Current flow ends with "The journal closes. Final streak: X"

Add:
- "Submit to Hall of Naturalists" button
- If not registered: prompt for nickname first
- After submit: show new rank, prompt to verify email

### User Identity Bar

Small bar in header (when logged in):
- Shows nickname
- "Verify email" link if unverified
- Could expand to show personal best

## Environment Variables

```
RESEND_API_KEY=re_UsKLJcNd_3inLUDxQjtyjkM9UKTMFzNTk
RESEND_FROM_EMAIL=noreply@sahil.pro
```

Store in `.dev.vars` (local) and Cloudflare secrets (prod).

## Work Streams (Parallel)

### Stream A: Schema & Types (blocks B, C)
- D1 migration file
- Update wrangler.toml (uncomment D1 binding)
- TypeScript types for User, FieldJournal, Sighting

### Stream B: Auth APIs (after A)
- `/api/auth/register`
- `/api/auth/send-magic-link`
- `/api/auth/verify`
- `/api/auth/me`
- Resend integration

### Stream C: Leaderboard API (after A)
- `/api/journal` (submit)
- `/api/leaderboard` (fetch)

### Stream D: Leaderboard UI (after C)
- `/leaderboard` page
- LeaderboardView.vue component
- Entry component with styling

### Stream E: Game Integration (after A, B, C)
- Client-side user context (localStorage UUID)
- Registration flow in GameView
- Submit journal on game over
- Link to leaderboard from game over screen

## Out of Scope (Future)

- Social login (Google, GitHub)
- Expedition replays/sharing
- Achievements system
- Per-filter leaderboards
- Friend challenges
