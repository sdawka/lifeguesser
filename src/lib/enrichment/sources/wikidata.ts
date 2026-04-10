// TODO: Wikidata property shapes are stable but our heuristic Q-ID resolution
// (picking the first search result that mentions "species" or "taxon" in the
// description) may occasionally pick the wrong entity for common-name collisions.
// Conservative: if the description is ambiguous, skip.

import type {
  EnrichmentSource,
  TaxonEnrichment,
  IucnStatus,
  SourcedField,
} from '../types';
import { cachedFetch } from '../../cached-fetch';

const IUCN_QID_MAP: Record<string, IucnStatus> = {
  Q211005: 'LC',
  Q719675: 'NT',
  Q278113: 'VU',
  Q11394: 'EN',
  Q219127: 'CR',
  Q239509: 'EW',
  Q237350: 'EX',
  Q3245512: 'DD',
};

const MASS_UNIT_TO_GRAMS: Record<string, number> = {
  Q11570: 1000, // kilogram
  Q41803: 1, // gram
  Q11767: 0.001, // milligram
  Q828224: 453.592, // pound
  Q223962: 28.3495, // ounce
};

const YEAR_UNIT_QID = 'Q577';

const UA = 'lifeguesser/0.1 (https://lifeguesser.pages.dev)';
const TTL = 60 * 60 * 24 * 30; // 30 days

async function findTaxonQid(name: string): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const url =
    `https://www.wikidata.org/w/api.php?action=wbsearchentities` +
    `&search=${encodeURIComponent(trimmed)}` +
    `&language=en&type=item&format=json&origin=*`;

  // TODO: plumb ctx.signal through cachedFetch when it supports AbortSignal.
  const res = await cachedFetch(url, {
    ttlSeconds: TTL,
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!res.ok) return null;

  const json = (await res.json()) as {
    search?: Array<{ id?: unknown; description?: unknown }>;
  };
  if (!Array.isArray(json.search)) return null;

  for (const entry of json.search) {
    if (!entry || typeof entry.id !== 'string') continue;
    const desc =
      typeof entry.description === 'string' ? entry.description.toLowerCase() : '';
    if (
      desc.includes('species') ||
      desc.includes('taxon') ||
      desc.includes('genus') ||
      desc.includes('family')
    ) {
      return entry.id;
    }
  }
  return null;
}

function unitQidFromUrl(unit: unknown): string | null {
  if (typeof unit !== 'string') return null;
  const idx = unit.lastIndexOf('/');
  if (idx < 0) return null;
  const tail = unit.slice(idx + 1);
  return tail || null;
}

function parseAmount(amount: unknown): number | null {
  if (typeof amount !== 'string') return null;
  const stripped = amount.startsWith('+') ? amount.slice(1) : amount;
  const n = Number(stripped);
  return Number.isFinite(n) ? n : null;
}

async function fetchTaxonClaims(qid: string): Promise<Partial<TaxonEnrichment>> {
  const url = `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`;
  // TODO: plumb ctx.signal through cachedFetch when it supports AbortSignal.
  const res = await cachedFetch(url, {
    ttlSeconds: TTL,
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!res.ok) return {};

  const json = (await res.json()) as {
    entities?: Record<string, { claims?: Record<string, unknown> }>;
  };
  const entity = json.entities?.[qid];
  const claims = entity?.claims;
  if (!claims || typeof claims !== 'object') return {};

  const now = Math.floor(Date.now() / 1000);
  const out: Partial<TaxonEnrichment> = {};

  // P141 - IUCN conservation status
  const p141 = (claims as Record<string, unknown>).P141;
  if (Array.isArray(p141)) {
    for (const claim of p141) {
      const id = (claim as any)?.mainsnak?.datavalue?.value?.id;
      if (typeof id === 'string' && IUCN_QID_MAP[id]) {
        out.iucnStatus = {
          value: IUCN_QID_MAP[id],
          source: 'wikidata',
          fetchedAt: now,
        } satisfies SourcedField<IucnStatus>;
        break;
      }
    }
  }

  // P2067 - body mass
  const p2067 = (claims as Record<string, unknown>).P2067;
  if (Array.isArray(p2067) && p2067.length > 0) {
    const val = (p2067[0] as any)?.mainsnak?.datavalue?.value;
    const amount = parseAmount(val?.amount);
    const unitQid = unitQidFromUrl(val?.unit);
    if (amount !== null && unitQid && MASS_UNIT_TO_GRAMS[unitQid] !== undefined) {
      out.bodyMassG = {
        value: amount * MASS_UNIT_TO_GRAMS[unitQid],
        source: 'wikidata',
        fetchedAt: now,
      } satisfies SourcedField<number>;
    }
  }

  // P2250 - life expectancy
  const p2250 = (claims as Record<string, unknown>).P2250;
  if (Array.isArray(p2250) && p2250.length > 0) {
    const val = (p2250[0] as any)?.mainsnak?.datavalue?.value;
    const amount = parseAmount(val?.amount);
    const unitQid = unitQidFromUrl(val?.unit);
    // Trust years unless a non-year unit is explicitly specified.
    const unitOk = !unitQid || unitQid === '1' || unitQid === YEAR_UNIT_QID;
    if (amount !== null && unitOk) {
      out.lifespanYears = {
        value: amount,
        source: 'wikidata',
        fetchedAt: now,
      } satisfies SourcedField<number>;
    }
  }

  return out;
}

export const wikidataSource: EnrichmentSource = {
  name: 'wikidata',
  async fetch(_taxonId, ctx): Promise<Partial<TaxonEnrichment>> {
    if (!ctx.taxonName) return {};
    try {
      const qid = await findTaxonQid(ctx.taxonName);
      if (!qid) return {};
      return await fetchTaxonClaims(qid);
    } catch {
      return {};
    }
  },
};
