import type { TaxonEnrichment, TraitSource, SourcedField } from './types';

export interface SourceResult {
  source: TraitSource;
  data: Partial<TaxonEnrichment> | null;
}

type TraitFieldKey =
  | 'diet'
  | 'habitats'
  | 'continents'
  | 'iucnStatus'
  | 'bodyMassG'
  | 'lifespanYears'
  | 'locomotion'
  | 'wikipediaSummary';

const PRIORITIES: Record<TraitFieldKey, TraitSource[]> = {
  diet: ['eol', 'wikidata', 'inat'],
  habitats: ['eol', 'wikidata', 'inat'],
  bodyMassG: ['eol', 'wikidata', 'inat'],
  lifespanYears: ['eol', 'wikidata', 'inat'],
  locomotion: ['eol', 'wikidata', 'inat'],
  continents: ['wikidata', 'eol', 'inat'],
  iucnStatus: ['inat', 'wikidata', 'eol'],
  wikipediaSummary: ['inat', 'wikipedia'],
};

function normalize(value: unknown): string {
  if (Array.isArray(value)) {
    return JSON.stringify([...value].sort());
  }
  return JSON.stringify(value);
}

function pickWithProvenance<T>(
  field: TraitFieldKey,
  results: SourceResult[],
): SourcedField<T> | undefined {
  const priority = PRIORITIES[field];
  const bySource = new Map<TraitSource, SourcedField<T>>();
  for (const r of results) {
    if (!r.data) continue;
    const f = (r.data as Record<string, unknown>)[field] as
      | SourcedField<T>
      | undefined;
    if (f && f.value !== undefined && f.value !== null) {
      bySource.set(r.source, f);
    }
  }
  if (bySource.size === 0) return undefined;

  let winner: SourcedField<T> | undefined;
  for (const src of priority) {
    const f = bySource.get(src);
    if (f) {
      winner = f;
      break;
    }
  }
  if (!winner) return undefined;

  // disagreement check
  const winnerNorm = normalize(winner.value);
  let disagreement = false;
  for (const [, f] of bySource) {
    if (normalize(f.value) !== winnerNorm) {
      disagreement = true;
      break;
    }
  }

  return disagreement ? { ...winner, confidence: 0.7 } : winner;
}

export function mergeTraits(
  taxonId: number,
  taxonName: string,
  results: SourceResult[],
): TaxonEnrichment {
  const now = Math.floor(Date.now() / 1000);
  const sourcesAttempted = Array.from(new Set(results.map((r) => r.source)));

  const diet = pickWithProvenance<TaxonEnrichment['diet'] extends SourcedField<infer U> | undefined ? U : never>('diet', results);
  const habitats = pickWithProvenance<TaxonEnrichment['habitats'] extends SourcedField<infer U> | undefined ? U : never>('habitats', results);
  const continents = pickWithProvenance<TaxonEnrichment['continents'] extends SourcedField<infer U> | undefined ? U : never>('continents', results);
  const iucnStatus = pickWithProvenance<TaxonEnrichment['iucnStatus'] extends SourcedField<infer U> | undefined ? U : never>('iucnStatus', results);
  const bodyMassG = pickWithProvenance<number>('bodyMassG', results);
  const lifespanYears = pickWithProvenance<number>('lifespanYears', results);
  const locomotion = pickWithProvenance<TaxonEnrichment['locomotion'] extends SourcedField<infer U> | undefined ? U : never>('locomotion', results);
  const wikipediaSummary = pickWithProvenance<string>('wikipediaSummary', results);

  let commonName: string | undefined;
  for (const r of results) {
    if (r.data?.commonName) {
      commonName = r.data.commonName;
      break;
    }
  }

  const hasAny =
    diet ||
    habitats ||
    continents ||
    iucnStatus ||
    bodyMassG ||
    lifespanYears ||
    locomotion ||
    wikipediaSummary ||
    commonName;

  const base: TaxonEnrichment = {
    taxonId,
    taxonName,
    enrichedAt: now,
    sourcesAttempted,
    schemaVersion: 1,
  };

  if (!hasAny) {
    return { ...base, retryAfter: now + 86400 };
  }

  if (commonName) base.commonName = commonName;
  if (diet) base.diet = diet;
  if (habitats) base.habitats = habitats;
  if (continents) base.continents = continents;
  if (iucnStatus) base.iucnStatus = iucnStatus;
  if (bodyMassG) base.bodyMassG = bodyMassG;
  if (lifespanYears) base.lifespanYears = lifespanYears;
  if (locomotion) base.locomotion = locomotion;
  if (wikipediaSummary) base.wikipediaSummary = wikipediaSummary;

  return base;
}
