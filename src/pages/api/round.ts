import type { APIRoute } from 'astro';
import { getOrFetchPool } from '../../lib/pool';
import { getKV } from '../../lib/kv';
import { getObservationRepo } from '../../lib/repo';
import { placeIdToContinent, type ContinentCode } from '../../lib/filters';
import type { Filters, Observation, RoundPayload } from '../../types';

export const prerender = false;

function parseIds(raw: string | null): number[] | undefined {
  if (!raw) return undefined;
  const ids = raw.split(',').map(Number).filter(Number.isFinite);
  return ids.length ? ids : undefined;
}

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const kv = getKV(locals);
    const obsRepo = getObservationRepo(locals);

    const taxonIds = parseIds(url.searchParams.get('taxa') ?? url.searchParams.get('taxon'));
    const placeIds = parseIds(url.searchParams.get('places') ?? url.searchParams.get('place'));

    let obs: Observation | null = null;

    // 1. Hot path: serve from D1 observations table.
    if (obsRepo) {
      const continents = placeIds
        ?.map(placeIdToContinent)
        .filter((c): c is ContinentCode => !!c);
      obs = await obsRepo.pickRandom({
        categoryIds: taxonIds,
        continents: continents?.length ? continents : undefined,
      });
    }

    // 2. Fallback: iNat via KV-cached pool (only when D1 has nothing matching —
    //    e.g., custom taxa not in our seeded preset roots).
    if (!obs) {
      const filters: Filters = { taxonIds, placeIds };
      const ctx = (locals as any)?.runtime?.ctx;
      const pool = await getOrFetchPool(kv, filters, ctx);
      if (!pool.length) {
        return new Response(JSON.stringify({ error: 'No observations found' }), { status: 404 });
      }
      obs = pool[Math.floor(Math.random() * pool.length)];
    }

    const roundId = crypto.randomUUID();
    await kv.put(`round:${roundId}`, JSON.stringify({
      lat: obs.lat,
      lng: obs.lng,
      taxonId: obs.taxonId,
      taxonName: obs.taxonName,
      observationUrl: obs.observationUrl,
      ancestry: obs.ancestry,
    }), { expirationTtl: 600 });

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
