import type { EnrichmentSource, SourcedField } from '../types';
import { cachedFetch } from '../../cached-fetch';

export const wikipediaSource: EnrichmentSource = {
  name: 'wikipedia',
  async fetch(_taxonId, ctx) {
    try {
      if (!ctx.taxonName || !ctx.taxonName.trim()) return {};

      // Wikipedia titles use underscores, not spaces
      const title = encodeURIComponent(ctx.taxonName.trim().replace(/\s+/g, '_'));
      const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${title}`;

      // TODO: plumb ctx.signal through cachedFetch once supported
      const res = await cachedFetch(url, {
        ttlSeconds: 60 * 60 * 24 * 30, // 30 days
        headers: {
          'User-Agent': 'lifeguesser/0.1 (https://lifeguesser.pages.dev)',
          Accept: 'application/json',
        },
      });

      if (!res.ok) return {};

      const json = (await res.json()) as { extract?: string; type?: string };

      // Skip disambiguation pages
      if (json.type === 'disambiguation') return {};

      const extract = json.extract;
      if (typeof extract !== 'string' || extract.trim().length < 20) {
        return {};
      }

      const now = Math.floor(Date.now() / 1000);
      return {
        wikipediaSummary: {
          value: extract.trim(),
          source: 'wikipedia',
          fetchedAt: now,
        } satisfies SourcedField<string>,
      };
    } catch {
      return {};
    }
  },
};
