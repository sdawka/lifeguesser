// Cloudflare Pages scheduled (cron) function.
// The @cloudflare/workers-types version in use may not export `ScheduledEvent`
// or `EventContext` uniformly across releases, so we type the event loosely.
import type { KVNamespace, ExecutionContext } from '@cloudflare/workers-types';
import { getTaxonRepo } from '../src/lib/repo';
import { enrichTaxon } from '../src/lib/enrichment/coordinator';
import { ALL_SOURCES } from '../src/lib/enrichment/sources';

interface Env {
  LIFEGUESSER_KV: KVNamespace;
  // DB?: D1Database;  // future
}

const MAX_TAXA_PER_RUN = 50;
const DELAY_MS_BETWEEN_TAXA = 200;

/**
 * Scheduled sweep: walk recent pool caches, collect taxon IDs that
 * don't yet have enrichment records (or have expired retryAfter timers),
 * and enrich up to MAX_TAXA_PER_RUN per run with a small delay between
 * calls to stay under upstream rate limits.
 */
export async function scheduled(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  event: any,
  env: Env,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ctx: ExecutionContext,
): Promise<void> {
  const repo = getTaxonRepo({ runtime: { env } });
  const now = Math.floor(Date.now() / 1000);

  const taxonIds = await collectTaxaToEnrich(env.LIFEGUESSER_KV, repo, now);
  const toProcess = taxonIds.slice(0, MAX_TAXA_PER_RUN);

  console.log(`scheduled enrichment: ${toProcess.length}/${taxonIds.length} taxa queued`);

  for (const { id, name } of toProcess) {
    try {
      await enrichTaxon({
        repo,
        sources: ALL_SOURCES,
        taxonId: id,
        taxonName: name,
      });
    } catch (err) {
      console.warn(`scheduled enrichment failed for taxon ${id}`, err);
    }
    await sleep(DELAY_MS_BETWEEN_TAXA);
  }
}

export default { scheduled };

async function collectTaxaToEnrich(
  kv: KVNamespace,
  repo: ReturnType<typeof getTaxonRepo>,
  now: number,
): Promise<Array<{ id: number; name: string }>> {
  // List recent pool cache keys. KV list has limits — grab up to 200.
  const out = new Map<number, string>(); // taxonId -> taxonName
  let cursor: string | undefined;
  let scanned = 0;

  while (scanned < 200) {
    const list: any = await kv.list({ prefix: 'pool:v3:', limit: 50, cursor });
    for (const key of list.keys) {
      const raw = (await kv.get(key.name, 'json')) as any;
      const arr = Array.isArray(raw?.pool) ? raw.pool : Array.isArray(raw) ? raw : [];
      for (const obs of arr) {
        if (Number.isFinite(obs?.taxonId) && typeof obs?.taxonName === 'string') {
          if (!out.has(obs.taxonId)) out.set(obs.taxonId, obs.taxonName);
        }
      }
      scanned++;
    }
    if (list.list_complete || !list.cursor) break;
    cursor = list.cursor;
  }

  // Filter to those without a fresh enrichment record
  const result: Array<{ id: number; name: string }> = [];
  for (const [id, name] of out) {
    const existing = await repo.get(id);
    const fresh = existing && (!existing.retryAfter || existing.retryAfter < now);
    if (!fresh) result.push({ id, name });
  }
  return result;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
