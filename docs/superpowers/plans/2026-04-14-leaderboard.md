# Field Journal Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global leaderboard with streak/score rankings and optional email verification via magic links.

**Architecture:** D1 stores users, field_journals, and sightings. KV stores ephemeral magic link tokens. Client generates UUID for anonymous identity, optional Resend magic links for verification. Vue components for leaderboard UI.

**Tech Stack:** Astro, Vue 3, Cloudflare D1, Cloudflare KV, Resend (email), TypeScript

---

## File Structure

### New Files

| Path | Purpose |
|------|---------|
| `migrations/0002_leaderboard.sql` | D1 schema for users, field_journals, sightings |
| `src/lib/db.ts` | D1 database helper (get binding from locals) |
| `src/lib/leaderboard-types.ts` | TypeScript types for User, FieldJournal, Sighting, API payloads |
| `src/lib/user-storage.ts` | Client-side user ID and nickname persistence |
| `src/lib/resend.ts` | Resend email client wrapper |
| `src/pages/api/auth/register.ts` | POST - create user with nickname |
| `src/pages/api/auth/send-magic-link.ts` | POST - send verification email |
| `src/pages/api/auth/verify.ts` | GET - confirm magic link token |
| `src/pages/api/auth/me.ts` | GET - fetch current user info |
| `src/pages/api/journal.ts` | POST - submit completed expedition |
| `src/pages/api/leaderboard.ts` | GET - fetch rankings |
| `src/components/LeaderboardView.vue` | Main leaderboard component with tabs |
| `src/components/LeaderboardEntry.vue` | Single leaderboard row |
| `src/components/UserIdentityBar.vue` | Header bar showing nickname/verify link |
| `src/components/SubmitJournalModal.vue` | Game over submission flow |
| `src/pages/leaderboard.astro` | Leaderboard page |
| `tests/leaderboard.test.ts` | Unit tests for leaderboard queries |
| `tests/auth.test.ts` | Unit tests for auth flow |

### Modified Files

| Path | Changes |
|------|---------|
| `wrangler.toml` | Uncomment D1 binding, add database_id |
| `src/env.d.ts` | Add D1Database type to Runtime |
| `.dev.vars` | Add RESEND_API_KEY, RESEND_FROM_EMAIL |
| `src/components/GameView.vue` | Add submit flow on game over |
| `src/pages/play.astro` | Add UserIdentityBar to header |

---

## Stream A: Schema & Types

### Task 1: D1 Migration

**Files:**
- Create: `migrations/0002_leaderboard.sql`

- [ ] **Step 1: Create migration file**

```sql
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
```

- [ ] **Step 2: Commit migration**

```bash
git add migrations/0002_leaderboard.sql
git commit -m "feat: add leaderboard D1 migration"
```

---

### Task 2: Update Wrangler Config

**Files:**
- Modify: `wrangler.toml`

- [ ] **Step 1: Create D1 database**

```bash
npx wrangler d1 create lifeguesser
```

Copy the `database_id` from the output.

- [ ] **Step 2: Update wrangler.toml**

Replace the commented D1 section with:

```toml
[[d1_databases]]
binding = "DB"
database_name = "lifeguesser"
database_id = "<paste-database-id-here>"
```

- [ ] **Step 3: Apply migration locally**

```bash
npx wrangler d1 execute lifeguesser --local --file=migrations/0002_leaderboard.sql
```

Expected: "Executed ... statements"

- [ ] **Step 4: Commit config**

```bash
git add wrangler.toml
git commit -m "feat: enable D1 binding for leaderboard"
```

---

### Task 3: Update TypeScript Environment

**Files:**
- Modify: `src/env.d.ts`

- [ ] **Step 1: Add D1Database type**

Replace contents of `src/env.d.ts`:

```typescript
/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />
type KVNamespace = import("@cloudflare/workers-types").KVNamespace;
type D1Database = import("@cloudflare/workers-types").D1Database;
type Runtime = import("@astrojs/cloudflare").Runtime<{
  LIFEGUESSER_KV: KVNamespace;
  DB: D1Database;
  RESEND_API_KEY: string;
  RESEND_FROM_EMAIL: string;
}>;
declare namespace App {
  interface Locals extends Runtime {}
}
```

- [ ] **Step 2: Commit**

```bash
git add src/env.d.ts
git commit -m "feat: add D1 and Resend types to env"
```

---

### Task 4: Create Leaderboard Types

**Files:**
- Create: `src/lib/leaderboard-types.ts`

- [ ] **Step 1: Create types file**

```typescript
// src/lib/leaderboard-types.ts

export type User = {
  id: string;
  email: string | null;
  displayName: string;
  emailVerifiedAt: number | null;
  createdAt: number;
};

export type FieldJournal = {
  id: string;
  userId: string;
  streak: number;
  totalScore: number;
  filterHash: string;
  filterLabel: string;
  createdAt: number;
};

export type Sighting = {
  id: number;
  journalId: string;
  roundIndex: number;
  taxonId: number | null;
  taxonName: string;
  distanceKm: number;
  score: number;
  hintsUsed: number;
  passed: boolean;
};

// API request/response types

export type RegisterRequest = {
  userId: string;
  nickname: string;
};

export type RegisterResponse = {
  userId: string;
  displayName: string;
};

export type SendMagicLinkRequest = {
  userId: string;
  email: string;
};

export type SendMagicLinkResponse = {
  sent: boolean;
};

export type VerifyResponse = {
  verified: boolean;
  userId?: string;
};

export type MeResponse = {
  user: User | null;
};

export type SightingInput = {
  roundIndex: number;
  taxonId: number | null;
  taxonName: string;
  distanceKm: number;
  score: number;
  hintsUsed: number;
  passed: boolean;
};

export type SubmitJournalRequest = {
  journalId: string;
  userId: string;
  streak: number;
  totalScore: number;
  filterHash: string;
  filterLabel: string;
  rounds: SightingInput[];
};

export type SubmitJournalResponse = {
  journalId: string;
  rank: {
    streak: number;
    totalScore: number;
  };
};

export type LeaderboardEntry = {
  rank: number;
  displayName: string;
  value: number;
  filterLabel: string;
  verified: boolean;
};

export type LeaderboardType = 'streak' | 'totalScore';
export type LeaderboardWindow = 'allTime' | 'daily';

export type LeaderboardResponse = {
  type: LeaderboardType;
  window: LeaderboardWindow;
  entries: LeaderboardEntry[];
  userRank: number | null;
  userValue: number | null;
};
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/leaderboard-types.ts
git commit -m "feat: add leaderboard TypeScript types"
```

---

### Task 5: Create DB Helper

**Files:**
- Create: `src/lib/db.ts`

- [ ] **Step 1: Create db helper**

```typescript
// src/lib/db.ts

type Locals = App.Locals;

export function getDB(locals: Locals): D1Database {
  const db = locals.runtime?.env?.DB;
  if (!db) throw new Error('D1 database not available');
  return db;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat: add D1 database helper"
```

---

### Task 6: Create User Storage (Client-side)

**Files:**
- Create: `src/lib/user-storage.ts`

- [ ] **Step 1: Create user storage**

```typescript
// src/lib/user-storage.ts

const USER_ID_KEY = 'lifeguesser:userId';
const USER_NAME_KEY = 'lifeguesser:userName';

export function getUserId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(USER_ID_KEY);
}

export function setUserId(id: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(USER_ID_KEY, id);
}

export function getUserName(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(USER_NAME_KEY);
}

export function setUserName(name: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(USER_NAME_KEY, name);
}

export function generateUserId(): string {
  return crypto.randomUUID();
}

export function clearUser(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(USER_ID_KEY);
  localStorage.removeItem(USER_NAME_KEY);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/user-storage.ts
git commit -m "feat: add client-side user storage helpers"
```

---

## Stream B: Auth APIs

### Task 7: Create Resend Helper

**Files:**
- Create: `src/lib/resend.ts`
- Modify: `.dev.vars`

- [ ] **Step 1: Add env vars to .dev.vars**

Append to `.dev.vars`:

```
RESEND_API_KEY=re_UsKLJcNd_3inLUDxQjtyjkM9UKTMFzNTk
RESEND_FROM_EMAIL=noreply@sahil.pro
```

- [ ] **Step 2: Create resend helper**

```typescript
// src/lib/resend.ts

type Locals = App.Locals;

type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
};

export async function sendEmail(
  locals: Locals,
  params: SendEmailParams
): Promise<{ success: boolean; error?: string }> {
  const apiKey = locals.runtime?.env?.RESEND_API_KEY;
  const fromEmail = locals.runtime?.env?.RESEND_FROM_EMAIL ?? 'noreply@sahil.pro';

  if (!apiKey) {
    console.error('RESEND_API_KEY not configured');
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: params.to,
        subject: params.subject,
        html: params.html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Resend error:', err);
      return { success: false, error: 'Failed to send email' };
    }

    return { success: true };
  } catch (err: any) {
    console.error('Resend error:', err);
    return { success: false, error: err?.message ?? 'Failed to send email' };
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/resend.ts .dev.vars
git commit -m "feat: add Resend email helper"
```

---

### Task 8: Register Endpoint

**Files:**
- Create: `src/pages/api/auth/register.ts`
- Create: `tests/auth.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/auth.test.ts

import { describe, it, expect } from 'vitest';

describe('auth types', () => {
  it('RegisterRequest has required fields', () => {
    const req = { userId: 'test-uuid', nickname: 'TestUser' };
    expect(req.userId).toBeDefined();
    expect(req.nickname).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

```bash
npm test -- tests/auth.test.ts
```

Expected: PASS

- [ ] **Step 3: Create register endpoint**

```typescript
// src/pages/api/auth/register.ts

import type { APIRoute } from 'astro';
import { getDB } from '../../../lib/db';
import type { RegisterRequest, RegisterResponse } from '../../../lib/leaderboard-types';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const db = getDB(locals);
    const body = (await request.json()) as RegisterRequest;

    if (!body.userId || !body.nickname) {
      return new Response(JSON.stringify({ error: 'userId and nickname required' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    const nickname = body.nickname.trim().slice(0, 30);
    if (nickname.length < 1) {
      return new Response(JSON.stringify({ error: 'Nickname too short' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    // Check if user already exists
    const existing = await db
      .prepare('SELECT id, display_name FROM users WHERE id = ?')
      .bind(body.userId)
      .first<{ id: string; display_name: string }>();

    if (existing) {
      const response: RegisterResponse = {
        userId: existing.id,
        displayName: existing.display_name,
      };
      return new Response(JSON.stringify(response), {
        headers: { 'content-type': 'application/json' },
      });
    }

    // Create new user
    const now = Date.now();
    await db
      .prepare('INSERT INTO users (id, display_name, created_at) VALUES (?, ?, ?)')
      .bind(body.userId, nickname, now)
      .run();

    const response: RegisterResponse = {
      userId: body.userId,
      displayName: nickname,
    };

    return new Response(JSON.stringify(response), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err: any) {
    console.error('register error:', err);
    return new Response(JSON.stringify({ error: err?.message ?? 'Internal error' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
};
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/auth/register.ts tests/auth.test.ts
git commit -m "feat: add /api/auth/register endpoint"
```

---

### Task 9: Send Magic Link Endpoint

**Files:**
- Create: `src/pages/api/auth/send-magic-link.ts`

- [ ] **Step 1: Create endpoint**

```typescript
// src/pages/api/auth/send-magic-link.ts

import type { APIRoute } from 'astro';
import { getDB } from '../../../lib/db';
import { getKV } from '../../../lib/kv';
import { sendEmail } from '../../../lib/resend';
import type { SendMagicLinkRequest, SendMagicLinkResponse } from '../../../lib/leaderboard-types';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, url }) => {
  try {
    const db = getDB(locals);
    const kv = getKV(locals);
    const body = (await request.json()) as SendMagicLinkRequest;

    if (!body.userId || !body.email) {
      return new Response(JSON.stringify({ error: 'userId and email required' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.email)) {
      return new Response(JSON.stringify({ error: 'Invalid email format' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    // Check user exists
    const user = await db
      .prepare('SELECT id, display_name FROM users WHERE id = ?')
      .bind(body.userId)
      .first<{ id: string; display_name: string }>();

    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }

    // Check if email already used by another user
    const emailTaken = await db
      .prepare('SELECT id FROM users WHERE email = ? AND id != ?')
      .bind(body.email, body.userId)
      .first();

    if (emailTaken) {
      return new Response(JSON.stringify({ error: 'Email already in use' }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      });
    }

    // Generate token and store in KV with 15-min TTL
    const token = crypto.randomUUID();
    const tokenData = JSON.stringify({ userId: body.userId, email: body.email });
    await kv.put(`magic:${token}`, tokenData, { expirationTtl: 900 });

    // Build verification URL
    const verifyUrl = `${url.origin}/api/auth/verify?token=${token}`;

    // Send email
    const result = await sendEmail(locals, {
      to: body.email,
      subject: 'Verify your LifeGuesser identity',
      html: `
        <h2>Welcome, ${user.display_name}!</h2>
        <p>Click the link below to verify your email and claim your spot on the leaderboard:</p>
        <p><a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#2d5016;color:#fff;text-decoration:none;border-radius:4px;">Verify Email</a></p>
        <p>This link expires in 15 minutes.</p>
        <p style="color:#666;font-size:12px;">If you didn't request this, you can ignore this email.</p>
      `,
    });

    if (!result.success) {
      return new Response(JSON.stringify({ error: result.error ?? 'Failed to send email' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }

    const response: SendMagicLinkResponse = { sent: true };
    return new Response(JSON.stringify(response), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (err: any) {
    console.error('send-magic-link error:', err);
    return new Response(JSON.stringify({ error: err?.message ?? 'Internal error' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/api/auth/send-magic-link.ts
git commit -m "feat: add /api/auth/send-magic-link endpoint"
```

---

### Task 10: Verify Endpoint

**Files:**
- Create: `src/pages/api/auth/verify.ts`

- [ ] **Step 1: Create endpoint**

```typescript
// src/pages/api/auth/verify.ts

import type { APIRoute } from 'astro';
import { getDB } from '../../../lib/db';
import { getKV } from '../../../lib/kv';

export const prerender = false;

export const GET: APIRoute = async ({ url, locals, redirect }) => {
  try {
    const db = getDB(locals);
    const kv = getKV(locals);
    const token = url.searchParams.get('token');

    if (!token) {
      return redirect('/leaderboard?error=missing-token');
    }

    // Get and delete token from KV
    const tokenData = await kv.get(`magic:${token}`);
    if (!tokenData) {
      return redirect('/leaderboard?error=invalid-token');
    }
    await kv.delete(`magic:${token}`);

    const { userId, email } = JSON.parse(tokenData) as { userId: string; email: string };

    // Update user with verified email
    const now = Date.now();
    await db
      .prepare('UPDATE users SET email = ?, email_verified_at = ? WHERE id = ?')
      .bind(email, now, userId)
      .run();

    return redirect('/leaderboard?verified=true');
  } catch (err: any) {
    console.error('verify error:', err);
    return redirect('/leaderboard?error=verification-failed');
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/api/auth/verify.ts
git commit -m "feat: add /api/auth/verify endpoint"
```

---

### Task 11: Me Endpoint

**Files:**
- Create: `src/pages/api/auth/me.ts`

- [ ] **Step 1: Create endpoint**

```typescript
// src/pages/api/auth/me.ts

import type { APIRoute } from 'astro';
import { getDB } from '../../../lib/db';
import type { MeResponse, User } from '../../../lib/leaderboard-types';

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const db = getDB(locals);
    const userId = url.searchParams.get('userId');

    if (!userId) {
      const response: MeResponse = { user: null };
      return new Response(JSON.stringify(response), {
        headers: { 'content-type': 'application/json' },
      });
    }

    const row = await db
      .prepare('SELECT id, email, display_name, email_verified_at, created_at FROM users WHERE id = ?')
      .bind(userId)
      .first<{
        id: string;
        email: string | null;
        display_name: string;
        email_verified_at: number | null;
        created_at: number;
      }>();

    if (!row) {
      const response: MeResponse = { user: null };
      return new Response(JSON.stringify(response), {
        headers: { 'content-type': 'application/json' },
      });
    }

    const user: User = {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      emailVerifiedAt: row.email_verified_at,
      createdAt: row.created_at,
    };

    const response: MeResponse = { user };
    return new Response(JSON.stringify(response), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (err: any) {
    console.error('me error:', err);
    return new Response(JSON.stringify({ error: err?.message ?? 'Internal error' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/api/auth/me.ts
git commit -m "feat: add /api/auth/me endpoint"
```

---

## Stream C: Leaderboard API

### Task 12: Submit Journal Endpoint

**Files:**
- Create: `src/pages/api/journal.ts`

- [ ] **Step 1: Create endpoint**

```typescript
// src/pages/api/journal.ts

import type { APIRoute } from 'astro';
import { getDB } from '../../lib/db';
import type { SubmitJournalRequest, SubmitJournalResponse } from '../../lib/leaderboard-types';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const db = getDB(locals);
    const body = (await request.json()) as SubmitJournalRequest;

    // Validate required fields
    if (!body.journalId || !body.userId || body.streak == null || body.totalScore == null) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    // Verify user exists
    const user = await db
      .prepare('SELECT id FROM users WHERE id = ?')
      .bind(body.userId)
      .first();

    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }

    const now = Date.now();

    // Insert field journal
    await db
      .prepare(`
        INSERT INTO field_journals (id, user_id, streak, total_score, filter_hash, filter_label, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        body.journalId,
        body.userId,
        body.streak,
        body.totalScore,
        body.filterHash ?? '',
        body.filterLabel ?? 'All · World',
        now
      )
      .run();

    // Insert sightings
    if (body.rounds && body.rounds.length > 0) {
      for (const round of body.rounds) {
        await db
          .prepare(`
            INSERT INTO sightings (journal_id, round_index, taxon_id, taxon_name, distance_km, score, hints_used, passed)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .bind(
            body.journalId,
            round.roundIndex,
            round.taxonId,
            round.taxonName,
            round.distanceKm,
            round.score,
            round.hintsUsed,
            round.passed ? 1 : 0
          )
          .run();
      }
    }

    // Calculate user's rank for streak
    const streakRankRow = await db
      .prepare(`
        SELECT COUNT(*) + 1 as rank FROM field_journals
        WHERE streak > ?
      `)
      .bind(body.streak)
      .first<{ rank: number }>();

    // Calculate user's rank for total score
    const scoreRankRow = await db
      .prepare(`
        SELECT COUNT(*) + 1 as rank FROM field_journals
        WHERE total_score > ?
      `)
      .bind(body.totalScore)
      .first<{ rank: number }>();

    const response: SubmitJournalResponse = {
      journalId: body.journalId,
      rank: {
        streak: streakRankRow?.rank ?? 1,
        totalScore: scoreRankRow?.rank ?? 1,
      },
    };

    return new Response(JSON.stringify(response), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err: any) {
    console.error('journal submit error:', err);
    return new Response(JSON.stringify({ error: err?.message ?? 'Internal error' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/api/journal.ts
git commit -m "feat: add /api/journal endpoint"
```

---

### Task 13: Leaderboard Endpoint

**Files:**
- Create: `src/pages/api/leaderboard.ts`
- Create: `tests/leaderboard.test.ts`

- [ ] **Step 1: Write unit test for type validation**

```typescript
// tests/leaderboard.test.ts

import { describe, it, expect } from 'vitest';
import type { LeaderboardType, LeaderboardWindow } from '../src/lib/leaderboard-types';

describe('leaderboard types', () => {
  it('LeaderboardType accepts valid values', () => {
    const types: LeaderboardType[] = ['streak', 'totalScore'];
    expect(types).toHaveLength(2);
  });

  it('LeaderboardWindow accepts valid values', () => {
    const windows: LeaderboardWindow[] = ['allTime', 'daily'];
    expect(windows).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npm test -- tests/leaderboard.test.ts
```

Expected: PASS

- [ ] **Step 3: Create leaderboard endpoint**

```typescript
// src/pages/api/leaderboard.ts

import type { APIRoute } from 'astro';
import { getDB } from '../../lib/db';
import type {
  LeaderboardResponse,
  LeaderboardEntry,
  LeaderboardType,
  LeaderboardWindow,
} from '../../lib/leaderboard-types';

export const prerender = false;

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const db = getDB(locals);
    const type = (url.searchParams.get('type') ?? 'streak') as LeaderboardType;
    const window = (url.searchParams.get('window') ?? 'allTime') as LeaderboardWindow;
    const userId = url.searchParams.get('userId');

    // Validate type
    if (type !== 'streak' && type !== 'totalScore') {
      return new Response(JSON.stringify({ error: 'Invalid type' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    // Validate window
    if (window !== 'allTime' && window !== 'daily') {
      return new Response(JSON.stringify({ error: 'Invalid window' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    const orderColumn = type === 'streak' ? 'j.streak' : 'j.total_score';
    const valueColumn = type === 'streak' ? 'streak' : 'total_score';

    let whereClause = '';
    const bindings: (string | number)[] = [];

    if (window === 'daily') {
      const cutoff = Date.now() - TWENTY_FOUR_HOURS_MS;
      whereClause = 'WHERE j.created_at > ?';
      bindings.push(cutoff);
    }

    // Get top 10
    const topQuery = `
      SELECT
        u.display_name,
        u.email_verified_at,
        j.${valueColumn} as value,
        j.filter_label
      FROM field_journals j
      JOIN users u ON j.user_id = u.id
      ${whereClause}
      ORDER BY ${orderColumn} DESC
      LIMIT 10
    `;

    const topRows = await db
      .prepare(topQuery)
      .bind(...bindings)
      .all<{
        display_name: string;
        email_verified_at: number | null;
        value: number;
        filter_label: string;
      }>();

    const entries: LeaderboardEntry[] = (topRows.results ?? []).map((row, i) => ({
      rank: i + 1,
      displayName: row.display_name,
      value: row.value,
      filterLabel: row.filter_label,
      verified: row.email_verified_at !== null,
    }));

    // Get user's rank if userId provided
    let userRank: number | null = null;
    let userValue: number | null = null;

    if (userId) {
      // Get user's best score
      const userBestQuery = `
        SELECT MAX(${valueColumn}) as best
        FROM field_journals
        WHERE user_id = ?
        ${window === 'daily' ? 'AND created_at > ?' : ''}
      `;
      const userBindings: (string | number)[] = [userId];
      if (window === 'daily') {
        userBindings.push(Date.now() - TWENTY_FOUR_HOURS_MS);
      }

      const userBestRow = await db
        .prepare(userBestQuery)
        .bind(...userBindings)
        .first<{ best: number | null }>();

      if (userBestRow?.best != null) {
        userValue = userBestRow.best;

        // Count how many scores are better
        const rankQuery = `
          SELECT COUNT(DISTINCT j.user_id) + 1 as rank
          FROM field_journals j
          ${whereClause}
          ${whereClause ? 'AND' : 'WHERE'} j.${valueColumn} > ?
        `;
        const rankBindings = window === 'daily'
          ? [Date.now() - TWENTY_FOUR_HOURS_MS, userValue]
          : [userValue];

        const rankRow = await db
          .prepare(rankQuery)
          .bind(...rankBindings)
          .first<{ rank: number }>();

        userRank = rankRow?.rank ?? null;
      }
    }

    const response: LeaderboardResponse = {
      type,
      window,
      entries,
      userRank,
      userValue,
    };

    return new Response(JSON.stringify(response), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (err: any) {
    console.error('leaderboard error:', err);
    return new Response(JSON.stringify({ error: err?.message ?? 'Internal error' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
};
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/leaderboard.ts tests/leaderboard.test.ts
git commit -m "feat: add /api/leaderboard endpoint"
```

---

## Stream D: Leaderboard UI

### Task 14: Leaderboard Entry Component

**Files:**
- Create: `src/components/LeaderboardEntry.vue`

- [ ] **Step 1: Create component**

```vue
<!-- src/components/LeaderboardEntry.vue -->
<script setup lang="ts">
import type { LeaderboardEntry, LeaderboardType } from '../lib/leaderboard-types';

const props = defineProps<{
  entry: LeaderboardEntry;
  type: LeaderboardType;
  isCurrentUser?: boolean;
}>();

const medals = ['', '1st', '2nd', '3rd'] as const;

function formatValue(value: number, type: LeaderboardType): string {
  if (type === 'streak') {
    return `${value} ${value === 1 ? 'round' : 'rounds'}`;
  }
  return value.toLocaleString();
}
</script>

<template>
  <div
    class="flex items-center gap-4 px-4 py-3 border-b border-ink/20"
    :class="{ 'bg-moss/10': isCurrentUser }"
  >
    <!-- Rank -->
    <div class="w-12 text-center">
      <span
        v-if="entry.rank <= 3"
        class="font-display text-xl"
        :class="{
          'text-amber-500': entry.rank === 1,
          'text-slate-400': entry.rank === 2,
          'text-amber-700': entry.rank === 3,
        }"
      >
        {{ medals[entry.rank] }}
      </span>
      <span v-else class="font-mono text-ink-soft">#{{ entry.rank }}</span>
    </div>

    <!-- Name + Verified -->
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2">
        <span class="font-medium truncate">{{ entry.displayName }}</span>
        <span v-if="entry.verified" class="text-moss text-sm" title="Verified">✓</span>
      </div>
      <div class="text-xs text-ink-soft truncate">{{ entry.filterLabel }}</div>
    </div>

    <!-- Value -->
    <div class="text-right">
      <div class="font-mono text-lg font-medium">{{ formatValue(entry.value, type) }}</div>
      <div class="text-xs text-ink-soft uppercase tracking-wide">
        {{ type === 'streak' ? 'streak' : 'score' }}
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/LeaderboardEntry.vue
git commit -m "feat: add LeaderboardEntry component"
```

---

### Task 15: Leaderboard View Component

**Files:**
- Create: `src/components/LeaderboardView.vue`

- [ ] **Step 1: Create component**

```vue
<!-- src/components/LeaderboardView.vue -->
<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { getUserId } from '../lib/user-storage';
import type {
  LeaderboardResponse,
  LeaderboardType,
  LeaderboardWindow,
} from '../lib/leaderboard-types';
import LeaderboardEntry from './LeaderboardEntry.vue';

const type = ref<LeaderboardType>('streak');
const window = ref<LeaderboardWindow>('allTime');
const data = ref<LeaderboardResponse | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

async function fetchLeaderboard() {
  loading.value = true;
  error.value = null;
  try {
    const userId = getUserId();
    const params = new URLSearchParams({
      type: type.value,
      window: window.value,
    });
    if (userId) params.set('userId', userId);

    const res = await fetch(`/api/leaderboard?${params}`);
    if (!res.ok) throw new Error('Failed to fetch leaderboard');
    data.value = await res.json();
  } catch (err: any) {
    error.value = err?.message ?? 'Failed to load leaderboard';
  } finally {
    loading.value = false;
  }
}

onMounted(fetchLeaderboard);
watch([type, window], fetchLeaderboard);
</script>

<template>
  <div class="max-w-2xl mx-auto">
    <!-- Header -->
    <div class="flex items-baseline gap-3 mb-6">
      <span class="eyebrow">Hall of Naturalists</span>
      <span class="flex-1 h-px bg-ink opacity-30"></span>
    </div>

    <!-- Tabs -->
    <div class="flex gap-6 mb-6 border-b border-ink/20">
      <button
        class="pb-2 font-mono text-sm uppercase tracking-widest2 transition-colors"
        :class="type === 'streak' ? 'text-ink border-b-2 border-moss' : 'text-ink-soft hover:text-ink'"
        @click="type = 'streak'"
      >
        Streak
      </button>
      <button
        class="pb-2 font-mono text-sm uppercase tracking-widest2 transition-colors"
        :class="type === 'totalScore' ? 'text-ink border-b-2 border-moss' : 'text-ink-soft hover:text-ink'"
        @click="type = 'totalScore'"
      >
        Total Score
      </button>

      <div class="flex-1"></div>

      <button
        class="pb-2 font-mono text-xs uppercase tracking-widest2 transition-colors"
        :class="window === 'allTime' ? 'text-ink' : 'text-ink-soft hover:text-ink'"
        @click="window = 'allTime'"
      >
        All-Time
      </button>
      <button
        class="pb-2 font-mono text-xs uppercase tracking-widest2 transition-colors"
        :class="window === 'daily' ? 'text-ink' : 'text-ink-soft hover:text-ink'"
        @click="window = 'daily'"
      >
        Today
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-12">
      <div class="font-display italic text-xl text-ink-soft">Loading records…</div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="border border-rust text-rust px-4 py-3 text-sm">
      {{ error }}
    </div>

    <!-- Empty -->
    <div v-else-if="!data?.entries.length" class="text-center py-12">
      <div class="font-display italic text-xl text-ink-soft">No expeditions recorded yet</div>
      <a href="/play" class="btn-ink mt-4 inline-block">Start an Expedition</a>
    </div>

    <!-- Entries -->
    <div v-else class="border border-ink bg-paper-dark">
      <LeaderboardEntry
        v-for="entry in data.entries"
        :key="entry.rank"
        :entry="entry"
        :type="type"
        :is-current-user="false"
      />

      <!-- User's rank (if not in top 10) -->
      <div
        v-if="data.userRank && data.userRank > 10 && data.userValue != null"
        class="border-t border-ink"
      >
        <div class="px-4 py-2 text-xs text-ink-soft uppercase tracking-widest2 bg-paper">
          Your position
        </div>
        <LeaderboardEntry
          :entry="{
            rank: data.userRank,
            displayName: 'You',
            value: data.userValue,
            filterLabel: '',
            verified: false,
          }"
          :type="type"
          :is-current-user="true"
        />
      </div>
    </div>

    <!-- CTA -->
    <div class="mt-8 text-center">
      <a href="/play" class="btn-ghost">← Back to Expedition</a>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/LeaderboardView.vue
git commit -m "feat: add LeaderboardView component"
```

---

### Task 16: Leaderboard Page

**Files:**
- Create: `src/pages/leaderboard.astro`

- [ ] **Step 1: Create page**

```astro
---
// src/pages/leaderboard.astro
import LeaderboardView from '../components/LeaderboardView.vue';
import '../styles/global.css';

const url = new URL(Astro.request.url);
const verified = url.searchParams.get('verified') === 'true';
const error = url.searchParams.get('error');
---
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>LifeGuesser — Hall of Naturalists</title>
  </head>
  <body class="min-h-screen flex flex-col">
    <header class="px-6 md:px-10 pt-6">
      <div class="hairline"></div>
      <div class="flex items-center justify-between pt-3 text-[0.68rem] font-mono uppercase tracking-widest2 text-ink-soft">
        <span class="flex items-center gap-3">
          <a href="/" class="link-ink">← Index</a>
          <span class="opacity-40">|</span>
          <a href="/play" class="link-ink">Play</a>
        </span>
        <span class="font-display italic text-base not-italic md:not-italic">
          <span class="italic font-light">Life</span><span class="font-semibold">Guesser</span>
        </span>
        <span>Leaderboard</span>
      </div>
    </header>

    <main class="flex-1 px-4 md:px-10 pt-6 pb-10">
      {verified && (
        <div class="max-w-2xl mx-auto mb-6 border border-moss bg-moss/10 px-4 py-3 text-sm text-moss">
          ✓ Email verified! Your expeditions are now marked as verified.
        </div>
      )}
      {error && (
        <div class="max-w-2xl mx-auto mb-6 border border-rust bg-rust/10 px-4 py-3 text-sm text-rust">
          {error === 'invalid-token' && 'Verification link expired or invalid. Please request a new one.'}
          {error === 'missing-token' && 'Invalid verification link.'}
          {error === 'verification-failed' && 'Verification failed. Please try again.'}
        </div>
      )}
      <LeaderboardView client:only="vue" />
    </main>
  </body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/leaderboard.astro
git commit -m "feat: add leaderboard page"
```

---

## Stream E: Game Integration

### Task 17: User Identity Bar Component

**Files:**
- Create: `src/components/UserIdentityBar.vue`

- [ ] **Step 1: Create component**

```vue
<!-- src/components/UserIdentityBar.vue -->
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getUserId, getUserName, setUserId, setUserName, generateUserId } from '../lib/user-storage';
import type { User } from '../lib/leaderboard-types';

const user = ref<User | null>(null);
const loading = ref(true);
const showVerifyModal = ref(false);
const email = ref('');
const sending = ref(false);
const sent = ref(false);
const error = ref<string | null>(null);

async function fetchUser() {
  const userId = getUserId();
  if (!userId) {
    loading.value = false;
    return;
  }

  try {
    const res = await fetch(`/api/auth/me?userId=${userId}`);
    const data = await res.json();
    user.value = data.user;
    if (data.user) {
      setUserName(data.user.displayName);
    }
  } catch {
    // User doesn't exist in DB yet, that's okay
  } finally {
    loading.value = false;
  }
}

async function sendVerification() {
  if (!email.value || !user.value) return;
  sending.value = true;
  error.value = null;

  try {
    const res = await fetch('/api/auth/send-magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.value.id, email: email.value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Failed to send');
    sent.value = true;
  } catch (err: any) {
    error.value = err?.message ?? 'Failed to send verification email';
  } finally {
    sending.value = false;
  }
}

onMounted(fetchUser);
</script>

<template>
  <div v-if="!loading && user" class="flex items-center gap-3 text-xs">
    <span class="font-medium">{{ user.displayName }}</span>
    <span v-if="user.emailVerifiedAt" class="text-moss">✓</span>
    <button
      v-else
      class="text-ink-soft hover:text-ink underline"
      @click="showVerifyModal = true"
    >
      Verify email
    </button>

    <!-- Verify Modal -->
    <div
      v-if="showVerifyModal"
      class="fixed inset-0 bg-ink/50 flex items-center justify-center z-50"
      @click.self="showVerifyModal = false"
    >
      <div class="bg-paper border border-ink p-6 max-w-sm w-full mx-4">
        <h3 class="font-display italic text-xl mb-4">Verify Your Email</h3>

        <div v-if="sent" class="text-moss">
          Check your inbox! Click the link to verify.
        </div>

        <form v-else @submit.prevent="sendVerification">
          <input
            v-model="email"
            type="email"
            placeholder="your@email.com"
            class="w-full border border-ink px-3 py-2 mb-3 bg-paper"
            required
          />
          <div v-if="error" class="text-rust text-sm mb-3">{{ error }}</div>
          <div class="flex gap-3">
            <button type="button" class="btn-ghost flex-1" @click="showVerifyModal = false">
              Cancel
            </button>
            <button type="submit" class="btn-ink flex-1" :disabled="sending">
              {{ sending ? 'Sending…' : 'Send Link' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/UserIdentityBar.vue
git commit -m "feat: add UserIdentityBar component"
```

---

### Task 18: Submit Journal Modal Component

**Files:**
- Create: `src/components/SubmitJournalModal.vue`

- [ ] **Step 1: Create component**

```vue
<!-- src/components/SubmitJournalModal.vue -->
<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  getUserId,
  getUserName,
  setUserId,
  setUserName,
  generateUserId,
} from '../lib/user-storage';
import type { SubmitJournalResponse, SightingInput } from '../lib/leaderboard-types';

const props = defineProps<{
  open: boolean;
  streak: number;
  totalScore: number;
  filterHash: string;
  filterLabel: string;
  rounds: SightingInput[];
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'submitted', response: SubmitJournalResponse): void;
}>();

const step = ref<'nickname' | 'submitting' | 'done'>('nickname');
const nickname = ref(getUserName() ?? '');
const error = ref<string | null>(null);
const result = ref<SubmitJournalResponse | null>(null);

const hasExistingUser = computed(() => !!getUserId() && !!getUserName());

async function submit() {
  error.value = null;

  let userId = getUserId();
  const name = nickname.value.trim();

  if (!name) {
    error.value = 'Please enter a nickname';
    return;
  }

  step.value = 'submitting';

  try {
    // If no userId, generate one and register
    if (!userId) {
      userId = generateUserId();
      setUserId(userId);
    }

    // Register or update user
    const regRes = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, nickname: name }),
    });

    if (!regRes.ok) {
      const data = await regRes.json();
      throw new Error(data.error ?? 'Registration failed');
    }

    setUserName(name);

    // Submit journal
    const journalId = crypto.randomUUID();
    const journalRes = await fetch('/api/journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        journalId,
        userId,
        streak: props.streak,
        totalScore: props.totalScore,
        filterHash: props.filterHash,
        filterLabel: props.filterLabel,
        rounds: props.rounds,
      }),
    });

    if (!journalRes.ok) {
      const data = await journalRes.json();
      throw new Error(data.error ?? 'Submission failed');
    }

    result.value = await journalRes.json();
    step.value = 'done';
    emit('submitted', result.value!);
  } catch (err: any) {
    error.value = err?.message ?? 'Something went wrong';
    step.value = 'nickname';
  }
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 bg-ink/50 flex items-center justify-center z-50"
    @click.self="emit('close')"
  >
    <div class="bg-paper border border-ink p-6 max-w-sm w-full mx-4">
      <!-- Nickname step -->
      <template v-if="step === 'nickname'">
        <h3 class="font-display italic text-xl mb-2">Submit to Hall of Naturalists</h3>
        <p class="text-sm text-ink-soft mb-4">
          Record your expedition for posterity.
        </p>

        <div class="border border-ink/30 px-4 py-3 mb-4 bg-paper-dark">
          <div class="flex justify-between text-sm">
            <span>Streak</span>
            <span class="font-mono font-medium">{{ streak }}</span>
          </div>
          <div class="flex justify-between text-sm mt-1">
            <span>Total Score</span>
            <span class="font-mono font-medium">{{ totalScore.toLocaleString() }}</span>
          </div>
        </div>

        <form @submit.prevent="submit">
          <label class="block text-xs uppercase tracking-widest2 text-ink-soft mb-1">
            Your name for the record
          </label>
          <input
            v-model="nickname"
            type="text"
            placeholder="Intrepid Explorer"
            maxlength="30"
            class="w-full border border-ink px-3 py-2 mb-3 bg-paper"
            :disabled="hasExistingUser"
          />
          <div v-if="hasExistingUser" class="text-xs text-ink-soft mb-3">
            Submitting as {{ getUserName() }}
          </div>
          <div v-if="error" class="text-rust text-sm mb-3">{{ error }}</div>
          <div class="flex gap-3">
            <button type="button" class="btn-ghost flex-1" @click="emit('close')">
              Skip
            </button>
            <button type="submit" class="btn-ink flex-1">
              Submit →
            </button>
          </div>
        </form>
      </template>

      <!-- Submitting -->
      <template v-else-if="step === 'submitting'">
        <div class="text-center py-8">
          <div class="font-display italic text-xl">Recording expedition…</div>
        </div>
      </template>

      <!-- Done -->
      <template v-else-if="step === 'done' && result">
        <h3 class="font-display italic text-xl mb-4 text-moss">Expedition Recorded!</h3>

        <div class="border border-ink/30 px-4 py-3 mb-4 bg-paper-dark">
          <div class="flex justify-between text-sm">
            <span>Streak Rank</span>
            <span class="font-mono font-medium">#{{ result.rank.streak }}</span>
          </div>
          <div class="flex justify-between text-sm mt-1">
            <span>Score Rank</span>
            <span class="font-mono font-medium">#{{ result.rank.totalScore }}</span>
          </div>
        </div>

        <div class="flex gap-3">
          <button class="btn-ghost flex-1" @click="emit('close')">
            Close
          </button>
          <a href="/leaderboard" class="btn-ink flex-1 text-center">
            View Leaderboard →
          </a>
        </div>
      </template>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/SubmitJournalModal.vue
git commit -m "feat: add SubmitJournalModal component"
```

---

### Task 19: Integrate Into GameView

**Files:**
- Modify: `src/components/GameView.vue`

- [ ] **Step 1: Add imports and state**

At the top of `<script setup>`, add imports:

```typescript
import SubmitJournalModal from './SubmitJournalModal.vue';
import type { SightingInput, SubmitJournalResponse } from '../lib/leaderboard-types';
```

After the existing refs, add:

```typescript
const showSubmitModal = ref(false);
const journalSubmitted = ref(false);
const submittedRank = ref<{ streak: number; totalScore: number } | null>(null);
```

- [ ] **Step 2: Add computed for rounds as SightingInput**

Add computed property:

```typescript
const roundsForSubmit = computed((): SightingInput[] =>
  expeditionRounds.value.map((r, i) => ({
    roundIndex: i,
    taxonId: null,
    taxonName: r.taxonName,
    distanceKm: r.distanceKm,
    score: r.score,
    hintsUsed: r.hintsUsed,
    passed: r.passed,
  }))
);

const totalScore = computed(() =>
  expeditionRounds.value.reduce((sum, r) => sum + r.score, 0)
);
```

- [ ] **Step 3: Add handler for submission**

```typescript
function onJournalSubmitted(response: SubmitJournalResponse) {
  journalSubmitted.value = true;
  submittedRank.value = response.rank;
}
```

- [ ] **Step 4: Update playAgain to reset submission state**

In the `playAgain` function, add:

```typescript
journalSubmitted.value = false;
submittedRank.value = null;
showSubmitModal.value = false;
```

- [ ] **Step 5: Update template game-over section**

Find the game-over actions section (around line 334) and update:

```vue
<template v-if="state === 'gameover'">
  <a href="/" class="btn-ghost">← Change Filters</a>
  <button
    v-if="!journalSubmitted"
    type="button"
    class="btn-ink"
    @click="showSubmitModal = true"
  >
    Submit to Leaderboard
  </button>
  <a
    v-if="journalSubmitted"
    href="/leaderboard"
    class="btn-ghost"
  >
    View Leaderboard
  </a>
  <button type="button" class="btn-ink" @click="playAgain">
    New Expedition →
  </button>
</template>
```

- [ ] **Step 6: Add modal component at end of template**

Before the closing `</div>` of the main component, add:

```vue
<SubmitJournalModal
  :open="showSubmitModal"
  :streak="streak"
  :total-score="totalScore"
  :filter-hash="filterHash"
  :filter-label="expeditionRounds.length > 0 ? `Expedition` : 'All · World'"
  :rounds="roundsForSubmit"
  @close="showSubmitModal = false"
  @submitted="onJournalSubmitted"
/>
```

- [ ] **Step 7: Commit**

```bash
git add src/components/GameView.vue
git commit -m "feat: integrate leaderboard submission into game flow"
```

---

### Task 20: Add Leaderboard Link to Navigation

**Files:**
- Modify: `src/pages/play.astro`
- Modify: `src/pages/index.astro` (if exists)

- [ ] **Step 1: Update play.astro header**

In `src/pages/play.astro`, update the header links section to include leaderboard:

Find:
```astro
<a href="/stats" class="link-ink">Archive</a>
```

Change to:
```astro
<a href="/stats" class="link-ink">Archive</a>
<span class="opacity-40">|</span>
<a href="/leaderboard" class="link-ink">Leaderboard</a>
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/play.astro
git commit -m "feat: add leaderboard link to navigation"
```

---

### Task 21: Manual Testing

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Test anonymous flow**

1. Open http://localhost:4321/play
2. Play a game until game over
3. Click "Submit to Leaderboard"
4. Enter a nickname and submit
5. Verify rank is shown

- [ ] **Step 3: Test leaderboard page**

1. Go to http://localhost:4321/leaderboard
2. Verify entries appear
3. Toggle between Streak/Total Score
4. Toggle between All-Time/Today
5. Verify "Your position" shows if not in top 10

- [ ] **Step 4: Test email verification**

1. From game over or leaderboard, click "Verify email"
2. Enter email and send
3. Check inbox for magic link
4. Click link
5. Verify redirect to leaderboard with success message

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found in manual testing"
```

---

## Final Steps

### Task 22: Deploy

- [ ] **Step 1: Apply migration to production D1**

```bash
npx wrangler d1 execute lifeguesser --file=migrations/0002_leaderboard.sql
```

- [ ] **Step 2: Set production secrets**

```bash
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put RESEND_FROM_EMAIL
```

- [ ] **Step 3: Deploy**

```bash
npm run build && npx wrangler pages deploy dist
```

- [ ] **Step 4: Verify in production**

Test the full flow on the deployed site.
