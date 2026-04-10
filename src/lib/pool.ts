import type { KVNamespace } from '@cloudflare/workers-types';
import type { Filters, Observation } from '../types';
import { hashFilters } from './filters';
import { fetchObservationPool } from './inat';

const SWR_THRESHOLD_SECONDS = 6 * 3600;
const POOL_TTL_SECONDS = 86400 * 7;
const LOCK_TTL_SECONDS = 30;

// v1 shape: single `photoUrl`, no `ancestry`, no `taxonId`.
type LegacyObservation = Omit<Observation, 'photoUrls' | 'ancestry' | 'taxonId'> & {
  photoUrl?: string;
};

// v3 shape: wrapped with cachedAt for SWR freshness tracking.
interface PoolEnvelope {
  pool: Observation[];
  cachedAt: number;
}

function migrateLegacyPool(legacy: unknown): Observation[] | null {
  if (!Array.isArray(legacy) || legacy.length === 0) return null;
  const out: Observation[] = [];
  for (const r of legacy as LegacyObservation[]) {
    if (!r || typeof r !== 'object') continue;
    const photoUrls = Array.isArray((r as any).photoUrls)
      ? (r as any).photoUrls
      : r.photoUrl
        ? [r.photoUrl]
        : [];
    if (!photoUrls.length) continue;
    out.push({
      id: r.id,
      lat: r.lat,
      lng: r.lng,
      photoUrls,
      taxonName: r.taxonName,
      observerLogin: r.observerLogin,
      license: r.license,
      observationUrl: r.observationUrl,
      ancestry: Array.isArray((r as any).ancestry) ? (r as any).ancestry : [],
    });
  }
  return out.length ? out : null;
}

/**
 * A pool is "enriched" if at least some observations carry ancestry AND
 * taxonId. Legacy-migrated pools have neither and need a background refresh
 * to make the hint ladder work reliably.
 */
function isEnriched(pool: Observation[]): boolean {
  return pool.some((o) => (o.ancestry && o.ancestry.length > 0) || Number.isFinite(o.taxonId));
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

async function writeEnvelope(
  kv: KVNamespace,
  key: string,
  pool: Observation[]
): Promise<void> {
  const envelope: PoolEnvelope = { pool, cachedAt: nowSeconds() };
  await kv.put(key, JSON.stringify(envelope), { expirationTtl: POOL_TTL_SECONDS });
}

async function refreshPoolInBackground(
  kv: KVNamespace,
  key: string,
  filters: Filters
): Promise<void> {
  try {
    const fresh = await fetchObservationPool(filters);
    if (fresh.length) {
      await writeEnvelope(kv, key, fresh);
    }
  } catch (e) {
    console.error('background pool refresh failed', e);
  }
}

/**
 * Read a v3 envelope. Accepts both the new `{ pool, cachedAt }` shape and
 * (for pools written by a previous deploy under the same key) a bare array.
 */
function readEnvelope(raw: unknown): PoolEnvelope | null {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    return raw.length ? { pool: raw as Observation[], cachedAt: 0 } : null;
  }
  if (typeof raw === 'object' && Array.isArray((raw as any).pool)) {
    const env = raw as PoolEnvelope;
    return env.pool.length ? env : null;
  }
  return null;
}

export async function getOrFetchPool(
  kv: KVNamespace,
  filters: Filters,
  ctx?: { waitUntil?: (p: Promise<unknown>) => void }
): Promise<Observation[]> {
  const hash = await hashFilters(filters);
  const key = `pool:v3:${hash}`;
  const v2Key = `pool:v2:${hash}`;
  const legacyKey = `pool:${hash}`;
  const lockKey = `pool:lock:${hash}`;

  // 1. Fast path: cached v3 pool.
  const cachedRaw = await kv.get(key, 'json');
  const envelope = readEnvelope(cachedRaw);
  if (envelope) {
    const age = nowSeconds() - envelope.cachedAt;
    const stale = envelope.cachedAt === 0 || age > SWR_THRESHOLD_SECONDS;
    const needsEnrichRefresh = !isEnriched(envelope.pool);
    if ((stale || needsEnrichRefresh) && ctx?.waitUntil) {
      ctx.waitUntil(refreshPoolInBackground(kv, key, filters));
    }
    return envelope.pool;
  }

  // 2. Migration path: v2 entry (bare array under old key).
  const v2 = (await kv.get(v2Key, 'json')) as Observation[] | null;
  if (Array.isArray(v2) && v2.length > 0) {
    await writeEnvelope(kv, key, v2);
    if (ctx?.waitUntil) {
      ctx.waitUntil(refreshPoolInBackground(kv, key, filters));
    }
    return v2;
  }

  // 3. Recovery path: migrate a legacy v1 entry.
  const legacy = await kv.get(legacyKey, 'json');
  const migrated = migrateLegacyPool(legacy);
  if (migrated) {
    await writeEnvelope(kv, key, migrated);
    if (ctx?.waitUntil) {
      ctx.waitUntil(refreshPoolInBackground(kv, key, filters));
    }
    return migrated;
  }

  // 4. Cold path: in-flight coalescing so simultaneous cold requests for the
  // same filter hash don't all hit iNat.
  const existingLock = await kv.get(lockKey);
  if (existingLock) {
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const polled = readEnvelope(await kv.get(key, 'json'));
      if (polled) return polled.pool;
    }
    // Fall through — the other request may have failed.
  }

  try {
    await kv.put(lockKey, '1', { expirationTtl: LOCK_TTL_SECONDS });
  } catch (e) {
    console.error('pool lock put failed', e);
  }

  try {
    const pool = await fetchObservationPool(filters);
    await writeEnvelope(kv, key, pool);
    return pool;
  } finally {
    try {
      await kv.delete(lockKey);
    } catch {
      /* let it expire */
    }
  }
}
