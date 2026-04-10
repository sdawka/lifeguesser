import type { APIRoute } from 'astro';
import { getKV } from '../../../lib/kv';
import { getTaxonRepo } from '../../../lib/repo';
import {
  categoriesWithData,
  pickRandomCategories,
  type HintCategory,
} from '../../../lib/hints/categories';

export const prerender = false;

const JSON_HEADERS = { 'content-type': 'application/json' };

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const kv = getKV(locals);
    const body = (await request.json()) as { roundId?: string };
    const roundId = body?.roundId;
    if (!roundId) {
      return new Response(JSON.stringify({ error: 'roundId required' }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    const stored = (await kv.get(`round:${roundId}`, 'json')) as
      | { taxonId?: number }
      | null;
    if (!stored) {
      return new Response(JSON.stringify({ error: 'Round expired or not found' }), {
        status: 404,
        headers: JSON_HEADERS,
      });
    }

    if (!Number.isFinite(stored.taxonId)) {
      return new Response(
        JSON.stringify({ status: 'pending', categories: [] }),
        { headers: JSON_HEADERS },
      );
    }

    const repo = getTaxonRepo(locals);
    const enrichment = await repo.get(stored.taxonId as number);
    if (!enrichment) {
      return new Response(
        JSON.stringify({ status: 'pending', categories: [] }),
        { headers: JSON_HEADERS },
      );
    }

    const available = categoriesWithData(enrichment);
    // TODO: enable taxonomy categories once handler can build sibling-taxa distractors
    const filtered: HintCategory[] = available.filter(
      (c) => c !== 'taxonomy-class' && c !== 'taxonomy-order',
    );
    const picked = pickRandomCategories(filtered, 3);

    return new Response(
      JSON.stringify({ status: 'ready', categories: picked }),
      { headers: JSON_HEADERS },
    );
  } catch (err: any) {
    console.error('hint handler error', err?.stack ?? err);
    return new Response(
      JSON.stringify({ error: err?.message ?? 'internal error' }),
      { status: 500, headers: JSON_HEADERS },
    );
  }
};
