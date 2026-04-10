import type { APIRoute } from 'astro';
import { getKV } from '../../lib/kv';

export const prerender = false;

const MODEL = 'google/gemini-3.1-flash-lite-preview';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const kv = getKV(locals);
    const apiKey =
      (locals as any)?.runtime?.env?.OPENROUTER_KEY ??
      (import.meta as any)?.env?.OPENROUTER_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'OpenRouter key not configured' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }

    const body = (await request.json()) as { roundId: string };
    if (!body?.roundId) {
      return new Response(JSON.stringify({ error: 'roundId required' }), { status: 400 });
    }

    const stored = (await kv.get(`round:${body.roundId}`, 'json')) as
      | { taxonId?: number; taxonName?: string; ancestry?: { rank: string; name: string }[] }
      | null;
    if (!stored) {
      return new Response(JSON.stringify({ error: 'Round expired or not found' }), { status: 404 });
    }

    // Cache per-taxon (7d) so the same quip is reused across rounds for the same species.
    let cacheKey: string;
    let cacheTtl: number;
    if (stored.taxonId != null) {
      cacheKey = `quip:taxon:${stored.taxonId}`;
      cacheTtl = 60 * 60 * 24 * 7;
    } else {
      console.warn('quip: round has no taxonId, falling back to per-round cache');
      cacheKey = `quip:${body.roundId}`;
      cacheTtl = 600;
    }
    const cached = await kv.get(cacheKey, 'text');
    if (cached) {
      return new Response(JSON.stringify({ quip: cached, cached: true }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    const taxonName = stored.taxonName ?? 'this species';
    const ancestry = (stored.ancestry ?? []).map((a) => `${a.rank}: ${a.name}`).join(', ');

    const prompt = `You are a witty naturalist field-guide narrator in a nature geo-guessing game. Give a single short funny cryptic hint (max 30 words) about where in the world one might find "${taxonName}"${ancestry ? ` (${ancestry})` : ''}. Be playful and oblique — riddle-like — never name the country/continent directly. No preamble, no quotes, just the hint.`;

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://lifeguesser.pages.dev',
        'X-Title': 'LifeGuesser',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 120,
        temperature: 0.9,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('openrouter failure', res.status, text.slice(0, 500));
      return new Response(
        JSON.stringify({ error: `oracle unavailable (${res.status})` }),
        { status: 502, headers: { 'content-type': 'application/json' } }
      );
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const quip = data.choices?.[0]?.message?.content?.trim() ?? '';
    if (!quip) {
      return new Response(JSON.stringify({ error: 'empty response from oracle' }), { status: 502 });
    }

    await kv.put(cacheKey, quip, { expirationTtl: cacheTtl });

    return new Response(JSON.stringify({ quip, cached: false }), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (err: any) {
    console.error('quip handler error', err?.stack ?? err);
    return new Response(JSON.stringify({ error: err?.message ?? 'internal error' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
};
