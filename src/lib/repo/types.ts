import type { TaxonEnrichment } from '../enrichment/types';

export interface TaxonRepo {
  get(taxonId: number): Promise<TaxonEnrichment | null>;
  put(taxonId: number, record: TaxonEnrichment): Promise<void>;
  list(taxonIds: number[]): Promise<Map<number, TaxonEnrichment>>;
  /** Get all taxon IDs with enrichment data (for filtering pools) */
  getEnrichedTaxonIds?(): Promise<Set<number>>;
}
