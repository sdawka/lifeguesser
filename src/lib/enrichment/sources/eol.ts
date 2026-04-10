import type {
  EnrichmentSource,
  TaxonEnrichment,
  SourcedField,
  DietCategory,
  HabitatTag,
  Locomotion,
} from '../types';
import { cachedFetch } from '../../cached-fetch';

// TODO: EOL trait API shape varies by taxon and has changed over time.
// This implementation is best-effort; trait mapping may need adjustment
// after observing real responses for a sample of taxa. Conservative by
// default — we return no data rather than risk wrong data in a mini-game.

const TTL = 60 * 60 * 24 * 30; // 30 days
const UA = 'lifeguesser/0.1 (https://lifeguesser.pages.dev)';

export const eolSource: EnrichmentSource = {
  name: 'eol',
  async fetch(_taxonId, ctx): Promise<Partial<TaxonEnrichment>> {
    // TODO: plumb ctx.signal through cachedFetch once supported
    if (!ctx.taxonName || !ctx.taxonName.trim()) return {};
    try {
      const pageId = await findEolPageId(ctx.taxonName.trim());
      if (!pageId) return {};
      return await fetchEolTraits(pageId);
    } catch {
      return {};
    }
  },
};

async function findEolPageId(name: string): Promise<number | null> {
  try {
    const url = `https://eol.org/api/search/1.0.json?q=${encodeURIComponent(
      name,
    )}&page=1&exact=true`;
    const res = await cachedFetch(url, {
      ttlSeconds: TTL,
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as unknown;
    const results = (json as { results?: unknown })?.results;
    if (!Array.isArray(results) || results.length === 0) return null;
    const first = results[0] as { id?: unknown };
    const id = typeof first?.id === 'number'
      ? first.id
      : typeof first?.id === 'string'
        ? Number(first.id)
        : NaN;
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

async function fetchEolTraits(
  pageId: number,
): Promise<Partial<TaxonEnrichment>> {
  let json: unknown;
  try {
    const url = `https://eol.org/api/pages/1.0/${pageId}.json?taxonomy=false&traits=true`;
    const res = await cachedFetch(url, {
      ttlSeconds: TTL,
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (!res.ok) return {};
    json = await res.json();
  } catch {
    return {};
  }

  const traits = collectTraits(json);
  if (traits.length === 0) return {};

  const now = Math.floor(Date.now() / 1000);
  const out: Partial<TaxonEnrichment> = {};

  // diet — single-valued, first match wins
  for (const t of traits) {
    const p = t.predicate;
    if (!p) continue;
    if (!(p.includes('trophic level') || p.includes('trophic guild') || p.includes('diet'))) continue;
    const diet = mapDiet(t.value);
    if (diet) {
      out.diet = {
        value: diet,
        source: 'eol',
        fetchedAt: now,
      } satisfies SourcedField<DietCategory>;
      break;
    }
  }

  // habitats — multi-valued, dedup
  const habitatSet = new Set<HabitatTag>();
  for (const t of traits) {
    if (!t.predicate || !t.predicate.includes('habitat')) continue;
    for (const h of mapHabitats(t.value)) habitatSet.add(h);
  }
  if (habitatSet.size > 0) {
    out.habitats = {
      value: Array.from(habitatSet),
      source: 'eol',
      fetchedAt: now,
    } satisfies SourcedField<HabitatTag[]>;
  }

  // body mass — first match
  for (const t of traits) {
    const p = t.predicate;
    if (!p) continue;
    if (!(p.includes('body mass') || p.includes('adult body mass'))) continue;
    const grams = parseBodyMassG(t.rawValue, t.units);
    if (grams != null) {
      out.bodyMassG = {
        value: grams,
        source: 'eol',
        fetchedAt: now,
      } satisfies SourcedField<number>;
      break;
    }
  }

  // lifespan — first match
  for (const t of traits) {
    const p = t.predicate;
    if (!p) continue;
    if (!(p.includes('life span') || p.includes('lifespan') || p.includes('longevity'))) continue;
    const years = parseLifespanYears(t.rawValue, t.units);
    if (years != null) {
      out.lifespanYears = {
        value: years,
        source: 'eol',
        fetchedAt: now,
      } satisfies SourcedField<number>;
      break;
    }
  }

  // locomotion — first match
  for (const t of traits) {
    const p = t.predicate;
    if (!p) continue;
    if (!(p.includes('locomotion') || p.includes('mode of locomotion'))) continue;
    const loc = mapLocomotion(t.value);
    if (loc) {
      out.locomotion = {
        value: loc,
        source: 'eol',
        fetchedAt: now,
      } satisfies SourcedField<Locomotion>;
      break;
    }
  }

  return out;
}

interface NormalizedTrait {
  predicate: string; // lowercased
  value: string; // lowercased
  rawValue: unknown; // original value (may be numeric string / number)
  units: string; // lowercased, may be empty
}

// Walk an arbitrary EOL response and extract a flat list of traits.
// Defensive against multiple known/historical shapes.
function collectTraits(json: unknown): NormalizedTrait[] {
  const out: NormalizedTrait[] = [];
  if (!json || typeof json !== 'object') return out;

  const candidates: unknown[] = [];

  // Shape A: { taxonConcept: { dataObjects: [...] } }
  // Shape B: { taxonConcept: { data_objects: [...] } }
  // Shape C: { taxonConcept: { traits: [...] } }
  // Shape D: { traitBank: { traits: [...] } } / { trait_bank: { traits: [...] } }
  // Shape E: top-level { traits: [...] }
  const root = json as Record<string, unknown>;
  const tc = root.taxonConcept as Record<string, unknown> | undefined;
  if (tc && typeof tc === 'object') {
    pushIfArray(candidates, tc.dataObjects);
    pushIfArray(candidates, tc.data_objects);
    pushIfArray(candidates, tc.traits);
  }
  const tb =
    (root.traitBank as Record<string, unknown> | undefined) ??
    (root.trait_bank as Record<string, unknown> | undefined);
  if (tb && typeof tb === 'object') {
    pushIfArray(candidates, tb.traits);
  }
  pushIfArray(candidates, root.traits);

  for (const group of candidates) {
    if (!Array.isArray(group)) continue;
    for (const entry of group) {
      const n = normalizeTrait(entry);
      if (n) out.push(n);
    }
  }
  return out;
}

function pushIfArray(target: unknown[], v: unknown): void {
  if (Array.isArray(v)) target.push(v);
}

function normalizeTrait(entry: unknown): NormalizedTrait | null {
  if (!entry || typeof entry !== 'object') return null;
  const e = entry as Record<string, unknown>;

  // predicate: either a string or an object with label/name/uri
  const predicate = extractLabel(e.predicate) ?? extractLabel(e.measurement);
  if (!predicate) return null;

  // value: object.label, value.label, or literal value/measurementValue
  let valueLabel =
    extractLabel(e.object) ??
    extractLabel(e.value) ??
    extractLabel(e.object_term);
  let rawValue: unknown = valueLabel;
  if (!valueLabel) {
    const rv =
      (e.value as unknown) ??
      (e.measurementValue as unknown) ??
      (e.literal as unknown);
    if (typeof rv === 'string' || typeof rv === 'number') {
      rawValue = rv;
      valueLabel = String(rv);
    }
  } else {
    // prefer a raw numeric if present for quantitative traits
    const rv =
      (e.measurementValue as unknown) ??
      (e.value as unknown) ??
      (e.literal as unknown);
    if (typeof rv === 'string' || typeof rv === 'number') rawValue = rv;
  }

  if (valueLabel == null) valueLabel = '';

  const units =
    extractLabel(e.units) ??
    extractLabel(e.unit) ??
    extractLabel(e.measurementUnit) ??
    '';

  return {
    predicate: predicate.toLowerCase(),
    value: String(valueLabel).toLowerCase(),
    rawValue,
    units: units.toLowerCase(),
  };
}

function extractLabel(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  if (typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const cand =
    o.label ??
    (o.name as unknown) ??
    (o.en as unknown) ??
    (o.eng as unknown) ??
    (o.title as unknown);
  if (typeof cand === 'string') return cand;
  if (cand && typeof cand === 'object') {
    // e.g. { en: "foo" }
    const inner = (cand as Record<string, unknown>).en;
    if (typeof inner === 'string') return inner;
  }
  return null;
}

function mapDiet(value: string): DietCategory | null {
  const v = value;
  if (v.includes('carnivor')) return 'carnivore';
  if (v.includes('herbivor') || v.includes('plant')) return 'herbivore';
  if (v.includes('omnivor')) return 'omnivore';
  if (v.includes('detritivore') || v.includes('saprovore')) return 'detritivore';
  if (v.includes('parasit')) return 'parasite';
  return null;
}

function mapHabitats(value: string): HabitatTag[] {
  const v = value;
  const out: HabitatTag[] = [];
  if (v.includes('forest') || v.includes('woodland') || v.includes('jungle')) out.push('forest');
  if (v.includes('grass') || v.includes('savanna') || v.includes('prairie') || v.includes('steppe')) out.push('grassland');
  if (v.includes('wetland') || v.includes('marsh') || v.includes('swamp') || v.includes('bog')) out.push('wetland');
  if (v.includes('desert') || v.includes('arid')) out.push('desert');
  if (v.includes('tundra') || v.includes('arctic') || v.includes('polar')) out.push('tundra');
  if (v.includes('marine') || v.includes('ocean') || v.includes('sea') || v.includes('pelagic')) out.push('marine');
  if (v.includes('freshwater') || v.includes('river') || v.includes('lake') || v.includes('stream')) out.push('freshwater');
  if (v.includes('urban') || v.includes('anthropogenic')) out.push('urban');
  if (v.includes('montane') || v.includes('mountain') || v.includes('alpine')) out.push('mountain');
  if (v.includes('cave') || v.includes('subterranean')) out.push('cave');
  return out;
}

function mapLocomotion(value: string): Locomotion | null {
  const v = value;
  if (v.includes('terrestrial') || v.includes('cursorial')) return 'terrestrial';
  if (v.includes('aquatic') || v.includes('swimming')) return 'aquatic';
  if (v.includes('flying') || v.includes('aerial') || v.includes('volant')) return 'aerial';
  if (v.includes('arboreal') || v.includes('climbing')) return 'arboreal';
  if (v.includes('fossorial') || v.includes('burrowing')) return 'fossorial';
  return null;
}

function parseNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    // grab first numeric token; tolerates "1.5 kg" style
    const m = v.match(/-?\d+(?:\.\d+)?/);
    if (m) {
      const n = Number(m[0]);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function parseBodyMassG(raw: unknown, units: string): number | null {
  const n = parseNumber(raw);
  if (n == null) return null;
  let grams = n;
  if (units.includes('kg') || units.includes('kilogram')) grams = n * 1000;
  else if (units.includes('mg') || units.includes('milligram')) grams = n / 1000;
  // default: assume grams
  if (!Number.isFinite(grams)) return null;
  if (grams <= 0 || grams >= 1_000_000_000) return null;
  return grams;
}

function parseLifespanYears(raw: unknown, units: string): number | null {
  const n = parseNumber(raw);
  if (n == null) return null;
  let years = n;
  if (units.includes('day')) years = n / 365.25;
  else if (units.includes('month')) years = n / 12;
  // default: assume years
  if (!Number.isFinite(years)) return null;
  if (years <= 0 || years >= 500) return null;
  return years;
}
