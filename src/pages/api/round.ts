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
    // Parse comma-separated IDs (new format) or single IDs (backwards compat)
    const taxaParam = url.searchParams.get('taxa') ?? url.searchParams.get('taxon');
    const placesParam = url.searchParams.get('places') ?? url.searchParams.get('place');
    const filters: Filters = {
      taxonIds: taxaParam ? taxaParam.split(',').map(Number).filter(Number.isFinite) : undefined,
      placeIds: placesParam ? placesParam.split(',').map(Number).filter(Number.isFinite) : undefined,
    };
    // Normalize empty arrays to undefined
    if (filters.taxonIds?.length === 0) filters.taxonIds = undefined;
    if (filters.placeIds?.length === 0) filters.placeIds = undefined;

    const ctx = (locals as any)?.runtime?.ctx;
    const pool = await getOrFetchPool(kv, filters, ctx);
    if (!pool.length) {
      return new Response(JSON.stringify({ error: 'No observations found' }), { status: 404 });
    }

    // Prefer observations we have enrichment data for (hints will work)
    const repo = getTaxonRepo(locals);
    let enrichedPool = pool;
    if (repo.getEnrichedTaxonIds) {
      try {
        const enrichedIds = await repo.getEnrichedTaxonIds();
        const filtered = pool.filter(o => o.taxonId && enrichedIds.has(o.taxonId));
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

    // Background enrichment on repo miss / stale retryAfter.
    try {
      const existing = await repo.get(obs.taxonId ?? 0);
      const now = Math.floor(Date.now() / 1000);
      const fresh = existing && (!existing.retryAfter || existing.retryAfter < now);

      if (!fresh && Number.isFinite(obs.taxonId) && ctx?.waitUntil) {
        ctx.waitUntil(
          enrichTaxon({
            repo,
            sources: ALL_SOURCES,
            taxonId: obs.taxonId as number,
            taxonName: obs.taxonName,
          }).catch((e) => console.warn('background enrichTaxon failed', e))
        );
      }
    } catch (e) {
      console.warn('round enrichment scheduling failed', e);
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
