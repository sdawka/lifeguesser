import type { APIRoute } from 'astro';
import { getKV } from '../../../lib/kv';
import { getTaxonRepo } from '../../../lib/repo';
import { buildQuestion } from '../../../lib/hints/questions';
import type { HintCategory } from '../../../lib/hints/categories';

export const prerender = false;

const JSON_HEADERS = { 'content-type': 'application/json' };

const KNOWN_CATEGORIES: ReadonlySet<HintCategory> = new Set<HintCategory>([
  'diet',
  'habitat',
  'continent',
  'conservation',
  'taxonomy-class',
  'taxonomy-order',
]);

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const kv = getKV(locals);
    const body = (await request.json()) as {
      roundId?: string;
      category?: string;
    };
    const roundId = body?.roundId;
    const category = body?.category as HintCategory | undefined;

    if (!roundId || !category || !KNOWN_CATEGORIES.has(category)) {
      return new Response(
        JSON.stringify({ error: 'invalid roundId or category' }),
        { status: 400, headers: JSON_HEADERS },
      );
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
      return new Response(JSON.stringify({ error: 'round missing taxonId' }), {
        status: 404,
        headers: JSON_HEADERS,
      });
    }

    const repo = getTaxonRepo(locals);
    const enrichment = await repo.get(stored.taxonId as number);
    if (!enrichment) {
      return new Response(JSON.stringify({ error: 'enrichment not ready' }), {
        status: 404,
        headers: JSON_HEADERS,
      });
    }

    const question = buildQuestion(category, enrichment);
    if (!question) {
      return new Response(
        JSON.stringify({ error: 'category not available for this taxon' }),
        { status: 400, headers: JSON_HEADERS },
      );
    }

    const expectedValue = question.choices[question.correctIndex];
    await kv.put(
      `answer:${roundId}:${category}`,
      JSON.stringify({ correctIndex: question.correctIndex, expectedValue }),
      { expirationTtl: 600 },
    );

    return new Response(
      JSON.stringify({ question: question.prompt, choices: question.choices }),
      { headers: JSON_HEADERS },
    );
  } catch (err: any) {
    console.error('hint/question handler error', err?.stack ?? err);
    return new Response(
      JSON.stringify({ error: err?.message ?? 'internal error' }),
      { status: 500, headers: JSON_HEADERS },
    );
  }
};
