import type { TaxonRepo } from '../repo/types';
import type { EnrichmentSource, TaxonEnrichment } from './types';
import { mergeTraits, type SourceResult } from './merge';

export interface EnrichOptions {
  repo: TaxonRepo;
  sources: EnrichmentSource[];
  taxonId: number;
  taxonName?: string;
  timeoutMs?: number;
  force?: boolean;
}

async function fetchWithTimeout(
  source: EnrichmentSource,
  taxonId: number,
  taxonName: string | undefined,
  timeoutMs: number,
): Promise<SourceResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const data = await source.fetch(taxonId, { taxonName, signal: controller.signal });
    return { source: source.name, data: data ?? null };
  } catch (err) {
    console.warn(`enrichment source ${source.name} failed:`, err);
    return { source: source.name, data: null };
  } finally {
    clearTimeout(timer);
  }
}

export async function enrichTaxon(opts: EnrichOptions): Promise<TaxonEnrichment> {
  const { repo, sources, taxonId, taxonName, timeoutMs = 3000, force = false } = opts;
  const now = Math.floor(Date.now() / 1000);

  if (!force) {
    const existing = await repo.get(taxonId);
    if (existing && (existing.retryAfter === undefined || existing.retryAfter < now)) {
      return existing;
    }
  }

  const settled = await Promise.allSettled(
    sources.map((s) => fetchWithTimeout(s, taxonId, taxonName, timeoutMs)),
  );

  const results: SourceResult[] = settled.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    console.warn(`enrichment source ${sources[i].name} rejected:`, r.reason);
    return { source: sources[i].name, data: null };
  });

  const merged = mergeTraits(taxonId, taxonName ?? '', results);
  await repo.put(taxonId, merged);
  return merged;
}
