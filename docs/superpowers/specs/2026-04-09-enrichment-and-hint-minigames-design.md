# Taxon Enrichment & Hint Mini-Games

**Status:** Design approved, ready for implementation plan
**Date:** 2026-04-09

## Goals

Balance three equal priorities:

1. **Cost** — bound Cloudflare KV writes and OpenRouter spend; prefer structured free data over LLM calls.
2. **Performance** — eliminate iNat rate-limit bursts and cold-path latency in the hot request flow.
3. **Game enrichment** — turn hints from a passive ancestry ladder into category-based mini-games using real biological data (diet, habitat, range, conservation status).

Guiding principle: **the LLM is the last resort**, called only when structured sources cannot answer. The LLM never generates mini-game questions (hallucination risk is maximal when the player is being quizzed).

## Current state (baseline)

- Astro on Cloudflare Pages. KV binding `LIFEGUESSER_KV`. No D1 yet (account not available at design time).
- `src/pages/api/round.ts` creates a round from a pool of iNat observations, writes `round:{uuid}` to KV with 10-min TTL.
- `src/pages/api/hint.ts` walks a 4-level taxonomic ancestry ladder (kingdom → class → order → family), fetching ancestor data from iNat when the round doesn't have it cached.
- `src/pages/api/quip.ts` calls OpenRouter (Gemini flash-lite) for a witty hint, cached per `roundId` for 10 min.
- `src/lib/inat.ts` wraps fetches with the CF Cache API (7-day TTL) and handles 429 retries.
- `src/lib/pool.ts` caches observation pools in KV per filter hash, 7-day TTL, with a background refresh path for legacy unenriched pools.

### Known pain points

- **iNat burst limits** are hit regularly. Root cause: `fetchObservationPool` issues a sequential loop of `/taxa` batch calls (up to 5+ back-to-back) immediately after every cold pool fetch. iNat soft-throttles bursts much harder than sustained throughput.
- **Unauthenticated LLM endpoint** on `/api/quip` — potential runaway OpenRouter bill under abuse.
- **Hint content is thin** — taxonomic ladder only; no diet, habitat, range, or conservation data.
- **KV writes on every round** — `/api/round` writes one key per request; `/api/hint` rewrites rounds with enriched ancestry. Easy to blow through the 1k/day free write budget.

## Design decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Data sources | Layered: iNat `/taxa` → EOL → Wikidata → Wikipedia summary → LLM (last resort, never for mini-game questions) |
| Storage now | KV, behind a `TaxonRepo` interface |
| Storage later | D1, swapped in via the same interface — D1 schema written now, runnable when account is live |
| Enrichment trigger | Background-on-demand via `ctx.waitUntil` in `/api/round` **+** nightly bounded cron sweep |
| Pipeline shape | Source-per-module with a central coordinator and an explicit `mergeTraits` step |
| Hint UX | Category menu — player picks from 3 random available categories per round |
| Missing data | Category is hidden (not grayed) when no structured data exists for that taxon |
| Mini-game mechanic | Correct answer = hint is free; wrong answer = normal hint cost; no double penalty |
| Question generation | Server-side, from structured enums — never LLM-generated |
| Scoring cheat prevention | Correct answer stored server-side in KV keyed by `(roundId, category)`, TTL 10 min |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  API handlers: round.ts, hint.ts, hint/answer.ts, quip │
└──────────────┬──────────────────────────────────────────┘
               │ reads via
               ▼
┌─────────────────────────────────────────────────────────┐
│  TaxonRepo (interface)                                  │
│    get(taxonId) → TaxonEnrichment | null                │
│    put(taxonId, record)                                 │
│    list(ids) → batch fetch                              │
│                                                         │
│  Implementations:                                       │
│    KvTaxonRepo  (ships now)                             │
│    D1TaxonRepo  (ships when account is ready)           │
└──────────────┬──────────────────────────────────────────┘
               │ populated by
               ▼
┌─────────────────────────────────────────────────────────┐
│  Enrichment coordinator (lib/enrichment/coordinator.ts) │
│    enrichTaxon(id, ctx) → TaxonEnrichment               │
│                                                         │
│    calls EnrichmentSource[] in parallel (allSettled)    │
│    with per-source timeout, then mergeTraits()          │
│    with priority-based per-field provenance             │
└──────────────┬──────────────────────────────────────────┘
               │ pluggable sources (each implements EnrichmentSource)
               ▼
┌──────────┬──────────┬──────────┬─────────┐
│ iNatTaxa │   EOL    │ Wikidata │  Wiki   │
│  source  │  source  │  source  │ summary │
└──────────┴──────────┴──────────┴─────────┘
```

### New directories

- `src/lib/repo/` — `TaxonRepo` interface + `KvTaxonRepo` (+ future `D1TaxonRepo`)
- `src/lib/enrichment/` — coordinator, merge logic, shared `cachedFetch` helper, types
- `src/lib/enrichment/sources/` — one file per source, each a tiny module with one `fetch(taxonId, ctx)` method
- `src/lib/hints/` — category selection, question/distractor generation
- `functions/` — Cloudflare Pages scheduled function for cron enrichment
- `migrations/` — D1 SQL migrations (not executed until account is live)

## Data model

```ts
// src/lib/enrichment/types.ts

export type TraitSource = 'inat' | 'eol' | 'wikidata' | 'wikipedia' | 'llm';

export interface SourcedField<T> {
  value: T;
  source: TraitSource;
  fetchedAt: number;   // unix seconds
  confidence?: number; // 0..1; lowered when sources disagree
}

export type DietCategory =
  | 'carnivore' | 'herbivore' | 'omnivore' | 'detritivore' | 'parasite';

export type HabitatTag =
  | 'forest' | 'grassland' | 'wetland' | 'desert' | 'tundra'
  | 'marine' | 'freshwater' | 'urban' | 'mountain' | 'cave';

export type IucnStatus =
  | 'LC' | 'NT' | 'VU' | 'EN' | 'CR' | 'EW' | 'EX' | 'DD';

export type Continent =
  | 'africa' | 'antarctica' | 'asia' | 'europe'
  | 'north_america' | 'oceania' | 'south_america';

export type Locomotion =
  | 'terrestrial' | 'aquatic' | 'aerial' | 'arboreal' | 'fossorial';

export interface TaxonEnrichment {
  taxonId: number;
  taxonName: string;
  commonName?: string;

  // Structured traits — drive the mini-games
  diet?: SourcedField<DietCategory>;
  habitats?: SourcedField<HabitatTag[]>;         // multi-valued
  continents?: SourcedField<Continent[]>;        // multi-valued
  iucnStatus?: SourcedField<IucnStatus>;
  bodyMassG?: SourcedField<number>;
  lifespanYears?: SourcedField<number>;
  locomotion?: SourcedField<Locomotion>;

  // Prose — shown as reveal after the mini-game, never as the question itself
  wikipediaSummary?: SourcedField<string>;

  // Meta
  enrichedAt: number;
  sourcesAttempted: TraitSource[];   // audit trail
  retryAfter?: number;                // skip re-enrichment before this timestamp
  schemaVersion: 1;
}

export interface EnrichmentSource {
  readonly name: TraitSource;
  fetch(
    taxonId: number,
    ctx: { taxonName?: string; signal: AbortSignal }
  ): Promise<Partial<TaxonEnrichment>>;
}
```

### Field priority (used by `mergeTraits`)

| Field | Priority order |
|---|---|
| `diet`, `habitats`, `bodyMassG`, `lifespanYears`, `locomotion` | EOL > Wikidata > iNat |
| `continents` | Wikidata > EOL > iNat |
| `iucnStatus` | iNat > Wikidata > EOL |
| `wikipediaSummary` | iNat > Wikipedia |

When two sources disagree on a structured enum, the higher-priority wins, but `confidence` is set to 0.7 (vs. 1.0 for agreement or solo source).

### KV storage (now)

- Key: `taxon:v1:{taxonId}`
- Value: JSON-serialized `TaxonEnrichment`
- TTL: none (taxonomy is effectively immutable; let the cron refresh stale ones)
- `KvTaxonRepo.list(ids)` uses `Promise.all(ids.map(id => kv.get(...)))` — KV has no batch read but reads are cheap.

### D1 schema (runnable when account is ready)

```sql
-- migrations/0001_taxon_enrichment.sql

CREATE TABLE taxon_enrichment (
  taxon_id          INTEGER PRIMARY KEY,
  taxon_name        TEXT NOT NULL,
  common_name       TEXT,

  -- Indexable structured traits (denormalized for cheap per-round reads
  -- and future queries like "random carnivore in Africa")
  diet              TEXT,        -- DietCategory
  diet_source       TEXT,
  habitats          TEXT,        -- JSON array of HabitatTag
  habitats_source   TEXT,
  continents        TEXT,        -- JSON array of Continent
  continents_source TEXT,
  iucn_status       TEXT,
  iucn_source       TEXT,
  body_mass_g       REAL,
  lifespan_years    REAL,
  locomotion        TEXT,
  locomotion_source TEXT,

  wikipedia_summary TEXT,

  enriched_at       INTEGER NOT NULL,
  sources_attempted TEXT NOT NULL,   -- JSON array
  retry_after       INTEGER,
  schema_version    INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_taxon_diet       ON taxon_enrichment(diet);
CREATE INDEX idx_taxon_iucn       ON taxon_enrichment(iucn_status);
CREATE INDEX idx_taxon_enriched_at ON taxon_enrichment(enriched_at);
```

D1 swap is a one-file change: add `src/lib/repo/d1.ts` implementing `TaxonRepo`, flip the factory in `src/lib/repo/index.ts` to return it when the `DB` binding is present. No other code changes.

## Data flow

### Enrichment flow

```
enrichTaxon(taxonId, ctx)
  1. repo.get(taxonId)
       fresh = record exists AND (retryAfter unset OR retryAfter < now)
       if fresh → return early
  2. Promise.allSettled([
       iNatSource.fetch(id),
       eolSource.fetch(id),
       wikidataSource.fetch(id),
       wikipediaSource.fetch(id),
     ])
       each wrapped in a 3s AbortController timeout
       one source failing does not cancel the others
  3. mergeTraits(partials) → TaxonEnrichment
       per field: pick highest-priority source that returned a value
       disagreements lower confidence to 0.7
       sourcesAttempted tracks all sources that were called
  4. if no fields resolved:
       write sentinel { sourcesAttempted, retryAfter: now + 24h }
     else:
       repo.put(taxonId, record)
  5. return record
```

### Round flow

```
GET /api/round?taxon=...&place=...
  1. getOrFetchPool(filters) → observation           [SWR-cached, see below]
  2. create round:{uuid} in KV (10-min TTL)
  3. repo.get(obs.taxonId)
       if null → ctx.waitUntil(enrichTaxon(obs.taxonId, ctx))
       if fresh → no-op
  4. return RoundPayload immediately (photo + attribution)
```

Enrichment runs in `ctx.waitUntil` so it does not extend the user-visible request latency. By the time the player opens the hint menu (typically 3-10 seconds later), enrichment has usually landed.

### Hint flow

```
POST /api/hint { roundId }
  1. load round → taxonId
  2. repo.get(taxonId) → enrichment | null
  3. if null:
       return { categories: [], status: 'pending' }
     else:
       available = categoriesWithData(enrichment)
       picked = sampleRandom(available, 3)
       return { categories: picked }

POST /api/hint/question { roundId, category }
  1. load round → taxonId
  2. repo.get(taxonId) → enrichment
  3. question = buildQuestion(category, enrichment)
       e.g. diet: "What does this animal eat?"
            choices: shuffle([correctDiet, ...2 random other DietCategory values])
            correctIndex: server-side only
  4. store correctIndex under `answer:{roundId}:{category}` in KV (10-min TTL)
  5. return { question, choices }   // no correctIndex

POST /api/hint/answer { roundId, category, choiceIndex }
  1. load stored correctIndex
  2. if choiceIndex === correctIndex:
       return { correct: true, reveal: <field value + source> }
       (no score penalty)
     else:
       return { correct: false, reveal: <field value + source>, penalty: true }
       (client applies normal hint penalty to score)
```

### Category availability

```ts
// src/lib/hints/categories.ts

export type HintCategory =
  | 'diet' | 'habitat' | 'continent' | 'conservation'
  | 'taxonomy-class' | 'taxonomy-order';

function categoriesWithData(e: TaxonEnrichment): HintCategory[] {
  const out: HintCategory[] = [];
  if (e.diet) out.push('diet');
  if (e.habitats?.value.length) out.push('habitat');
  if (e.continents?.value.length) out.push('continent');
  if (e.iucnStatus) out.push('conservation');
  // taxonomy always available via iNat ancestry
  out.push('taxonomy-class', 'taxonomy-order');
  return out;
}
```

### Question generation

Per category, entirely from structured data:

| Category | Question | Choices | Distractor strategy |
|---|---|---|---|
| `diet` | "What does this animal eat?" | 3 from `DietCategory` | random other enum values |
| `habitat` | "Which habitat does this species prefer?" | 4 from `HabitatTag` | tags not in stored set |
| `continent` | "Where does this species live?" | 4 from `Continent` | continents not in stored set |
| `conservation` | "What is its IUCN status?" | 3 from `IucnStatus` | adjacent statuses (LC→NT, VU→EN) — more pedagogical than random |
| `taxonomy-class` | "What class does this belong to?" | 4 classes | sibling classes from iNat `/taxa` |
| `taxonomy-order` | "What order does this belong to?" | 4 orders | sibling orders from iNat `/taxa` |

Questions are generated at request time (not stored). Only the `correctIndex` is persisted, keyed by `(roundId, category)`.

## Cost & performance mitigations

### iNat (biggest immediate wins)

1. **Drop the `/taxa` batch burst** in `fetchObservationPool` (`src/lib/inat.ts:107-124`). Investigate whether `/observations` can return ancestor names inline (e.g. via the `taxon` field or an `include` parameter). If yes, delete the loop entirely. If no, add a 250ms delay between chunks to stop tripping burst limits.
2. **`per_page=200`** in `fetchObservationPool` — 4x pool variety per iNat call, zero downside.
3. **Universal SWR** in `getOrFetchPool`. Current code only background-refreshes unenriched pools. Extend: any cached pool older than 6h (configurable) is served immediately while `ctx.waitUntil` refreshes it. Players never wait on iNat after first warmup.
4. **In-flight coalescing on cold pool fetches.** Before hitting iNat for a cold filter hash, write `pool:lock:{hash}` to KV with 30s TTL. If the lock exists, poll the cache briefly (3 tries × 500ms) before falling through to the fetch. Prevents thundering herd when popular filter combos expire simultaneously.

### OpenRouter (quip.ts)

5. **Per-IP rate limit on `/api/quip`** via a Cloudflare Rate Limiting rule (dashboard config, no code). 10/min/IP.
6. **Hard monthly spend cap on OpenRouter** (dashboard setting).
7. **Cache quip per taxon, not per round.** Cache key becomes `quip:taxon:{taxonId}` with 7-day TTL. Same quip reused across all rounds for the same species. Pays the LLM cost once per species ever.

### Enrichment sources

8. **Shared `cachedFetch` helper** — extracted from `inat.ts`, used by every source. Taxonomy data is effectively immutable, so 30-day CF Cache API TTLs are safe for all sources.
9. **Per-source retry/backoff** lives in each source module, not the coordinator. Each source decides its own courtesy (EOL tolerates 2 retries, Wikipedia none).
10. **Bounded cron enrichment.** Max 50 taxa per invocation, 200ms delay between taxa. Cron runs every 6h; even hourly would stay well under every upstream's rate limits.

### KV writes

11. **Remove the round-rewrite path in `hint.ts`.** `resolveAncestry` currently rewrites `round:{id}` with enriched ancestry (`src/pages/api/hint.ts:71,98`). Once ancestry lives on the taxon repo instead of the round, this rewrite becomes dead code — one fewer KV write per hint call.

## Files touched

### New

- `src/lib/repo/types.ts`
- `src/lib/repo/kv.ts`
- `src/lib/repo/index.ts` (factory)
- `src/lib/enrichment/types.ts`
- `src/lib/enrichment/coordinator.ts`
- `src/lib/enrichment/merge.ts`
- `src/lib/enrichment/cached-fetch.ts`
- `src/lib/enrichment/sources/inat.ts`
- `src/lib/enrichment/sources/eol.ts`
- `src/lib/enrichment/sources/wikidata.ts`
- `src/lib/enrichment/sources/wikipedia.ts`
- `src/lib/hints/categories.ts`
- `src/lib/hints/questions.ts`
- `src/lib/hints/distractors.ts`
- `src/pages/api/hint/question.ts`
- `src/pages/api/hint/answer.ts`
- `functions/_scheduled.ts` (Pages cron)
- `migrations/0001_taxon_enrichment.sql`

### Modified

- `src/lib/inat.ts` — drop `/taxa` batch burst, `per_page=200`, extract `cachedFetch`
- `src/lib/pool.ts` — universal SWR, in-flight coalescing
- `src/pages/api/round.ts` — `ctx.waitUntil(enrichTaxon)` on repo miss
- `src/pages/api/hint.ts` — read from `TaxonRepo`, return categories, remove round-rewrite
- `src/pages/api/quip.ts` — cache key → `quip:taxon:{id}`
- `wrangler.toml` — add D1 binding (commented until ready). Cron trigger configured via Pages dashboard or `wrangler.toml` `[triggers]` depending on final deploy path — implementation plan to confirm.

## Build order

Each step leaves the game in a working state.

1. **Foundation** — `cached-fetch.ts`, `TaxonRepo` interface + `KvTaxonRepo`, trait types. No behavior change yet.
2. **iNat fixes** — drop `/taxa` batch burst, `per_page=200`, universal SWR, in-flight coalescing. Ships value immediately, independent of enrichment.
3. **First source** — wire `iNatSource` + minimal coordinator. `enrichTaxon` returns a record with just wiki summary + conservation status. End-to-end path works.
4. **Round integration** — `ctx.waitUntil(enrichTaxon)` in `/api/round`. `/api/hint` starts reading from repo.
5. **Remaining sources** — EOL, Wikidata, Wikipedia summary. Each lands independently, tested in isolation.
6. **Mini-game mechanics** — `/api/hint` returns categories; `/api/hint/question` + `/api/hint/answer` ship; frontend wires category UI and scoring.
7. **Cost hardening** — quip per-taxon cache, rate-limit rule (manual), monthly cap (manual).
8. **Cron** — scheduled enrichment sweep.
9. **D1 migration** — when account is available: run SQL, add `D1TaxonRepo`, flip factory.

## Testing strategy

- Each `EnrichmentSource` has unit tests with recorded fixture responses from the live API. Sources are pure functions of their input — trivially mockable.
- `mergeTraits` has unit tests covering: single source, multiple sources agreeing, multiple sources disagreeing (confidence lowered), all sources empty (sentinel record).
- `buildQuestion` has unit tests per category verifying distractor generation and that `correctIndex` matches the stored value.
- `/api/hint/answer` has an integration test verifying server-side correctness check (client-supplied `correctIndex` cannot spoof).
- `getOrFetchPool` SWR behavior has a test with a mock KV and a time-travel clock.

## Open questions / deferred

- **Exact `include` parameter for iNat `/observations`** — needs API experimentation to confirm we can drop the `/taxa` batch loop. If not, the 250ms-delay fallback is the plan.
- **Frontend UI for category picker** — out of scope for this spec; implementation plan will include a minimal mockup but the visual design is a separate concern.
- **Analytics on hint mini-game answer rates** — interesting future addition, not in scope now.
- **Per-player history / daily challenge** — would benefit from D1 being real; deferred.
