import type { KVNamespace } from '@cloudflare/workers-types';
import type { TaxonEnrichment } from '../enrichment/types';
import type { TaxonRepo } from './types';

const key = (taxonId: number) => `taxon:v1:${taxonId}`;

export class KvTaxonRepo implements TaxonRepo {
  constructor(private readonly kv: KVNamespace) {}

  async get(taxonId: number): Promise<TaxonEnrichment | null> {
    const raw = await this.kv.get(key(taxonId), 'json');
    return (raw as TaxonEnrichment | null) ?? null;
  }

  async put(taxonId: number, record: TaxonEnrichment): Promise<void> {
    await this.kv.put(key(taxonId), JSON.stringify(record));
  }

  async list(taxonIds: number[]): Promise<Map<number, TaxonEnrichment>> {
    const results = await Promise.all(
      taxonIds.map(async (id) => [id, await this.get(id)] as const),
    );
    const map = new Map<number, TaxonEnrichment>();
    for (const [id, rec] of results) {
      if (rec) map.set(id, rec);
    }
    return map;
  }
}
