export type Filters = { taxonId?: number; placeId?: number };
export type Observation = {
  id: number;
  lat: number;
  lng: number;
  photoUrls: string[];
  taxonId?: number;
  taxonName: string;
  observerLogin: string;
  license: string | null;
  observationUrl: string;
  ancestry: { rank: string; name: string }[];
};
export type RoundPayload = {
  roundId: string;
  photoUrls: string[];
  attribution: { observer: string; license: string | null; url: string };
};
export type TaxonEnrichmentSummary = {
  commonName?: string;
  wikipediaSummary?: string;
  diet?: string;
  habitats?: string[];
  continents?: string[];
  iucnStatus?: string;
  locomotion?: string;
};

export type GuessResult = {
  actualLat: number;
  actualLng: number;
  distanceKm: number;
  score: number;
  passed: boolean;
  taxonName: string;
  observationUrl: string;
  hintsUsed: number;
  scoreMultiplier: number;
  enrichment?: TaxonEnrichmentSummary;
};
export type GameMode = 'endless';
