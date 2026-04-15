import type { APIRoute } from 'astro';
import { getOrFetchPool } from '../../lib/pool';
import { getKV } from '../../lib/kv';
import { getTaxonRepo } from '../../lib/repo';
import { enrichTaxon } from '../../lib/enrichment/coordinator';
import { ALL_SOURCES } from '../../lib/enrichment/sources';
import type { Filters, RoundPayload } from '../../types';

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const kv = getKV(locals);
    const repo = getTaxonRepo(locals);

    // Parse comma-separated IDs (new format) or single IDs (backwards compat)
    const taxaParam = url.searchParams.get('taxa') ?? url.searchParams.get('taxon');
    const placesParam = url.searchParams.get('places') ?? url.searchParams.get('place');
    let filters: Filters = {
      taxonIds: taxaParam ? taxaParam.split(',').map(Number).filter(Number.isFinite) : undefined,
      placeIds: placesParam ? placesParam.split(',').map(Number).filter(Number.isFinite) : undefined,
    };
    // Normalize empty arrays to undefined
    if (filters.taxonIds?.length === 0) filters.taxonIds = undefined;
    if (filters.placeIds?.length === 0) filters.placeIds = undefined;

    // When no taxa filter, use enriched taxon IDs to ensure hints work
    // Sample up to 30 random enriched taxa to keep URL reasonable
    let enrichedIds: Set<number> | null = null;
    if (!filters.taxonIds && repo.getEnrichedTaxonIds) {
      try {
        enrichedIds = await repo.getEnrichedTaxonIds();
        if (enrichedIds.size > 0) {
          const allIds = Array.from(enrichedIds);
          // Shuffle and take 30 random enriched taxa
          for (let i = allIds.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allIds[i], allIds[j]] = [allIds[j], allIds[i]];
          }
          filters = { ...filters, taxonIds: allIds.slice(0, 30) };
        }
      } catch (e) {
        console.warn('Failed to get enriched taxa for filtering', e);
      }
    }

    const ctx = (locals as any)?.runtime?.ctx;
    const pool = await getOrFetchPool(kv, filters, ctx);
    if (!pool.length) {
      return new Response(JSON.stringify({ error: 'No observations found' }), { status: 404 });
    }

    // Additional filter to enriched taxa (in case pool was cached before enrichment)
    let enrichedPool = pool;
    if (enrichedIds || repo.getEnrichedTaxonIds) {
      try {
        const ids = enrichedIds ?? await repo.getEnrichedTaxonIds();
        const filtered = pool.filter(o => o.taxonId && ids.has(o.taxonId));
        if (filtered.length > 0) {
          enrichedPool = filtered;
        }
      } catch (e) {
        console.warn('Failed to filter by enriched taxa', e);
      }
    }

    const obs = enrichedPool[Math.floor(Math.random() * enrichedPool.length)];
    const roundId = crypto.randomUUID();
    await kv.put(`round:${roundId}`, JSON.stringify({
      lat: obs.lat, lng: obs.lng, taxonId: obs.taxonId, taxonName: obs.taxonName, observationUrl: obs.observationUrl, ancestry: obs.ancestry
    }), { expirationTtl: 600 });

    // Background enrichment: enrich unenriched taxa from the pool to grow our DB
    if (ctx?.waitUntil) {
      ctx.waitUntil((async () => {
        try {
          const ids = enrichedIds ?? (repo.getEnrichedTaxonIds ? await repo.getEnrichedTaxonIds() : new Set());

          // Find unenriched taxa from pool (unique by taxonId)
          const seen = new Set<number>();
          const unenriched: { taxonId: number; taxonName: string }[] = [];
          for (const o of pool) {
            if (o.taxonId && !ids.has(o.taxonId) && !seen.has(o.taxonId)) {
              seen.add(o.taxonId);
              unenriched.push({ taxonId: o.taxonId, taxonName: o.taxonName });
            }
          }

          // Enrich up to 5 new taxa per request (rate limit friendly)
          const toEnrich = unenriched.slice(0, 5);
          for (const { taxonId, taxonName } of toEnrich) {
            try {
              await enrichTaxon({ repo, sources: ALL_SOURCES, taxonId, taxonName });
            } catch (e) {
              console.warn(`background enrichTaxon failed for ${taxonId}`, e);
            }
          }

          if (toEnrich.length > 0) {
            console.log(`Enriched ${toEnrich.length} new taxa in background`);
          }
        } catch (e) {
          console.warn('background enrichment failed', e);
        }
      })());
    }

    const payload: RoundPayload = {
      roundId,
      photoUrls: obs.photoUrls,
      attribution: { observer: obs.observerLogin, license: obs.license, url: obs.observationUrl },
    };
    return new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json' } });
  } catch (err: any) {
    console.error('round handler error', err?.stack ?? err);
    const msg = err?.message ?? 'internal error';
    const rateLimited = /429/.test(msg);
    return new Response(
      JSON.stringify({
        error: rateLimited
          ? 'iNaturalist is rate-limiting us. Try another filter or wait a moment.'
          : msg,
      }),
      {
        status: rateLimited ? 503 : 500,
        headers: { 'content-type': 'application/json' },
      }
    );
  }
};
