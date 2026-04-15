import type { APIRoute } from 'astro';
import { haversineKm, scoreFromDistance, thresholdForRound, applyHintMultiplier, HINT_MULTIPLIERS } from '../../lib/scoring';
import { getKV } from '../../lib/kv';
import { getTaxonRepo } from '../../lib/repo';
import type { GuessResult, TaxonEnrichmentSummary } from '../../types';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const kv = getKV(locals);
    const body = await request.json() as { roundId: string; guessLat: number; guessLng: number; roundIndex: number; hintsUsed?: number };
    const key = `round:${body.roundId}`;
    const stored = await kv.get(key, 'json') as { lat:number; lng:number; taxonId?: number; taxonName:string; observationUrl:string } | null;
    if (!stored) {
      return new Response(JSON.stringify({ error: 'Round expired or not found' }), { status: 404 });
    }
    await kv.delete(key);

    const rawHints = Number(body.hintsUsed);
    const hintsUsed = Number.isFinite(rawHints) ? Math.max(0, Math.min(4, Math.floor(rawHints))) : 0;
    const mult = HINT_MULTIPLIERS[hintsUsed];

    const distanceKm = haversineKm({ lat: body.guessLat, lng: body.guessLng }, { lat: stored.lat, lng: stored.lng });
    const score = applyHintMultiplier(scoreFromDistance(distanceKm), hintsUsed);
    const passed = distanceKm <= thresholdForRound(body.roundIndex ?? 0);

    // Fetch enrichment data for the taxon
    let enrichment: TaxonEnrichmentSummary | undefined;
    if (stored.taxonId) {
      try {
        const repo = getTaxonRepo(locals);
        const data = await repo.get(stored.taxonId);
        if (data) {
          enrichment = {
            commonName: data.commonName,
            wikipediaSummary: data.wikipediaSummary?.value,
            diet: data.diet?.value,
            habitats: data.habitats?.value,
            continents: data.continents?.value,
            iucnStatus: data.iucnStatus?.value,
            locomotion: data.locomotion?.value,
          };
        }
      } catch (e) {
        console.warn('Failed to fetch enrichment for guess result', e);
      }
    }

    const result: GuessResult = {
      actualLat: stored.lat,
      actualLng: stored.lng,
      distanceKm,
      score,
      passed,
      taxonName: stored.taxonName,
      observationUrl: stored.observationUrl,
      hintsUsed,
      scoreMultiplier: mult,
      enrichment,
    };
    return new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json' } });
  } catch (err: any) {
    console.error('guess handler error', err?.stack ?? err);
    return new Response(JSON.stringify({ error: err?.message ?? 'internal error' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
};
