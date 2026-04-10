import type {
  EnrichmentSource,
  TaxonEnrichment,
  IucnStatus,
  SourcedField,
} from '../types';
import { cachedFetch } from '../../cached-fetch';

const IUCN_MAP: Record<string, IucnStatus> = {
  LC: 'LC',
  'least concern': 'LC',
  NT: 'NT',
  'near threatened': 'NT',
  VU: 'VU',
  vulnerable: 'VU',
  EN: 'EN',
  endangered: 'EN',
  CR: 'CR',
  'critically endangered': 'CR',
  EW: 'EW',
  'extinct in the wild': 'EW',
  EX: 'EX',
  extinct: 'EX',
  DD: 'DD',
  'data deficient': 'DD',
};

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export const iNatSource: EnrichmentSource = {
  name: 'inat',
  async fetch(taxonId, _ctx): Promise<Partial<TaxonEnrichment>> {
    // TODO: plumb ctx.signal through cachedFetch when it supports AbortSignal.
    const url = `https://api.inaturalist.org/v1/taxa/${taxonId}`;

    let res: Response;
    try {
      res = await cachedFetch(url, {
        ttlSeconds: 60 * 60 * 24 * 30, // 30 days — taxonomy is immutable
        headers: {
          'User-Agent': 'lifeguesser/0.1',
          Accept: 'application/json',
        },
      });
    } catch {
      return {};
    }

    if (!res.ok) return {};

    let json: { results?: Array<any> };
    try {
      json = (await res.json()) as { results?: Array<any> };
    } catch {
      return {};
    }

    const taxon = json.results?.[0];
    if (!taxon) return {};

    const now = Math.floor(Date.now() / 1000);
    const out: Partial<TaxonEnrichment> = {};

    if (taxon.preferred_common_name && typeof taxon.preferred_common_name === 'string') {
      out.commonName = taxon.preferred_common_name;
    }

    const summary = taxon.wikipedia_summary;
    if (typeof summary === 'string') {
      const cleaned = stripHtml(summary);
      if (cleaned) {
        out.wikipediaSummary = {
          value: cleaned,
          source: 'inat',
          fetchedAt: now,
        } satisfies SourcedField<string>;
      }
    }

    const rawStatus =
      taxon.conservation_status?.status ?? taxon.conservation_status?.status_name;
    if (typeof rawStatus === 'string') {
      const trimmed = rawStatus.trim();
      const mapped = IUCN_MAP[trimmed] ?? IUCN_MAP[trimmed.toLowerCase()];
      if (mapped) {
        out.iucnStatus = {
          value: mapped,
          source: 'inat',
          fetchedAt: now,
        } satisfies SourcedField<IucnStatus>;
      }
    }

    return out;
  },
};
