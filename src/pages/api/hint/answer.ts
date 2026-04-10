import type { APIRoute } from 'astro';
import { getKV } from '../../../lib/kv';
import { getTaxonRepo } from '../../../lib/repo';
import type { HintCategory } from '../../../lib/hints/categories';
import type { TraitSource } from '../../../lib/enrichment/types';

export const prerender = false;

const JSON_HEADERS = { 'content-type': 'application/json' };

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const kv = getKV(locals);
    const body = (await request.json()) as {
      roundId?: string;
      category?: HintCategory;
      choiceIndex?: number;
    };
    const { roundId, category, choiceIndex } = body ?? {};
    if (!roundId || !category || typeof choiceIndex !== 'number') {
      return new Response(JSON.stringify({ error: 'invalid body' }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    const answerKey = `answer:${roundId}:${category}`;
    const stored = (await kv.get(answerKey, 'json')) as
      | { correctIndex: number; expectedValue: string }
      | null;
    if (!stored) {
      return new Response(JSON.stringify({ error: 'answer window expired' }), {
        status: 404,
        headers: JSON_HEADERS,
      });
    }

    const correct = choiceIndex === stored.correctIndex;

    // Load enrichment for reveal.
    const round = (await kv.get(`round:${roundId}`, 'json')) as
      | { taxonId?: number }
      | null;
    let value: unknown = null;
    let source: TraitSource = 'inat';
    if (round && Number.isFinite(round.taxonId)) {
      try {
        const repo = getTaxonRepo(locals);
        const enrichment = await repo.get(round.taxonId as number);
        if (enrichment) {
          let field:
            | { value: unknown; source: TraitSource }
            | undefined;
          switch (category) {
            case 'diet':
              field = enrichment.diet;
              break;
            case 'habitat':
              field = enrichment.habitats;
              break;
            case 'continent':
              field = enrichment.continents;
              break;
            case 'conservation':
              field = enrichment.iucnStatus;
              break;
            default:
              field = undefined;
          }
          value = field?.value ?? null;
          source = field?.source ?? 'inat';
        }
      } catch (e) {
        console.warn('reveal lookup failed', e);
      }
    }

    // Best-effort replay prevention.
    try {
      await kv.delete(answerKey);
    } catch {}

    return new Response(
      JSON.stringify({ correct, reveal: { value, source } }),
      { headers: JSON_HEADERS },
    );
  } catch (err: any) {
    console.error('hint/answer handler error', err?.stack ?? err);
    return new Response(
      JSON.stringify({ error: err?.message ?? 'internal error' }),
      { status: 500, headers: JSON_HEADERS },
    );
  }
};
