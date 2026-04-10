import type { TaxonEnrichment } from '../enrichment/types';

export interface TaxonRepo {
  get(taxonId: number): Promise<TaxonEnrichment | null>;
  put(taxonId: number, record: TaxonEnrichment): Promise<void>;
  list(taxonIds: number[]): Promise<Map<number, TaxonEnrichment>>;
}
