export type TraitSource = 'inat' | 'eol' | 'wikidata' | 'wikipedia' | 'llm';

export interface SourcedField<T> {
  value: T;
  source: TraitSource;
  fetchedAt: number;
  confidence?: number;
}

export type DietCategory =
  | 'carnivore' | 'herbivore' | 'omnivore' | 'detritivore' | 'parasite';

export type HabitatTag =
  | 'forest' | 'grassland' | 'wetland' | 'desert' | 'tundra'
  | 'marine' | 'freshwater' | 'urban' | 'mountain' | 'cave';

export type IucnStatus =
  | 'LC' | 'NT' | 'VU' | 'EN' | 'CR' | 'EW' | 'EX' | 'DD';

export type Continent =
  | 'africa' | 'antarctica' | 'asia' | 'europe'
  | 'north_america' | 'oceania' | 'south_america';

export type Locomotion =
  | 'terrestrial' | 'aquatic' | 'aerial' | 'arboreal' | 'fossorial';

export interface TaxonEnrichment {
  taxonId: number;
  taxonName: string;
  commonName?: string;

  diet?: SourcedField<DietCategory>;
  habitats?: SourcedField<HabitatTag[]>;
  continents?: SourcedField<Continent[]>;
  iucnStatus?: SourcedField<IucnStatus>;
  bodyMassG?: SourcedField<number>;
  lifespanYears?: SourcedField<number>;
  locomotion?: SourcedField<Locomotion>;

  wikipediaSummary?: SourcedField<string>;

  enrichedAt: number;
  sourcesAttempted: TraitSource[];
  retryAfter?: number;
  schemaVersion: 1;
}

export interface EnrichmentSource {
  readonly name: TraitSource;
  fetch(
    taxonId: number,
    ctx: { taxonName?: string; signal: AbortSignal }
  ): Promise<Partial<TaxonEnrichment>>;
}

export const DIET_CATEGORIES: readonly DietCategory[] = [
  'carnivore', 'herbivore', 'omnivore', 'detritivore', 'parasite',
] as const;

export const HABITAT_TAGS: readonly HabitatTag[] = [
  'forest', 'grassland', 'wetland', 'desert', 'tundra',
  'marine', 'freshwater', 'urban', 'mountain', 'cave',
] as const;

export const IUCN_STATUSES: readonly IucnStatus[] = [
  'LC', 'NT', 'VU', 'EN', 'CR', 'EW', 'EX', 'DD',
] as const;

export const CONTINENTS: readonly Continent[] = [
  'africa', 'antarctica', 'asia', 'europe',
  'north_america', 'oceania', 'south_america',
] as const;
