import type { D1Database } from '@cloudflare/workers-types';
import type { TaxonEnrichment, DietCategory, HabitatTag, Continent, IucnStatus, Locomotion, TraitSource } from '../enrichment/types';
import type { TaxonRepo } from './types';

interface D1Row {
  taxon_id: number;
  taxon_name: string;
  common_name: string | null;
  diet: string | null;
  diet_source: string | null;
  habitats: string | null;
  habitats_source: string | null;
  continents: string | null;
  continents_source: string | null;
  iucn_status: string | null;
  iucn_source: string | null;
  body_mass_g: number | null;
  lifespan_years: number | null;
  locomotion: string | null;
  locomotion_source: string | null;
  wikipedia_summary: string | null;
  location_quip: string | null;
  enriched_at: number;
  sources_attempted: string;
  schema_version: number;
}

function mapSource(source: string | null): TraitSource {
  if (!source) return 'wikipedia';
  if (source === 'dbpedia') return 'wikidata'; // Map DBPedia to wikidata type
  return source as TraitSource;
}

function rowToEnrichment(row: D1Row): TaxonEnrichment {
  const enrichedAt = row.enriched_at;

  return {
    taxonId: row.taxon_id,
    taxonName: row.taxon_name,
    commonName: row.common_name ?? undefined,

    diet: row.diet ? {
      value: row.diet as DietCategory,
      source: mapSource(row.diet_source),
      fetchedAt: enrichedAt,
    } : undefined,

    habitats: row.habitats ? {
      value: JSON.parse(row.habitats) as HabitatTag[],
      source: mapSource(row.habitats_source),
      fetchedAt: enrichedAt,
    } : undefined,

    continents: row.continents ? {
      value: JSON.parse(row.continents) as Continent[],
      source: mapSource(row.continents_source),
      fetchedAt: enrichedAt,
    } : undefined,

    iucnStatus: row.iucn_status ? {
      value: row.iucn_status as IucnStatus,
      source: mapSource(row.iucn_source),
      fetchedAt: enrichedAt,
    } : undefined,

    bodyMassG: row.body_mass_g ? {
      value: row.body_mass_g,
      source: 'wikipedia',
      fetchedAt: enrichedAt,
    } : undefined,

    lifespanYears: row.lifespan_years ? {
      value: row.lifespan_years,
      source: 'wikipedia',
      fetchedAt: enrichedAt,
    } : undefined,

    locomotion: row.locomotion ? {
      value: row.locomotion as Locomotion,
      source: mapSource(row.locomotion_source),
      fetchedAt: enrichedAt,
    } : undefined,

    wikipediaSummary: row.wikipedia_summary ? {
      value: row.wikipedia_summary,
      source: 'wikipedia',
      fetchedAt: enrichedAt,
    } : undefined,

    enrichedAt,
    sourcesAttempted: JSON.parse(row.sources_attempted || '[]'),
    schemaVersion: 1,
  };
}

export class D1TaxonRepo implements TaxonRepo {
  constructor(private readonly db: D1Database) {}

  /** Get taxon IDs with 2+ hints (usable for gameplay) */
  async getEnrichedTaxonIds(): Promise<Set<number>> {
    const stmt = this.db.prepare(`
      SELECT taxon_id FROM taxon_enrichment
      WHERE (
        CASE WHEN diet IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN habitats IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN locomotion IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN iucn_status IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN wikipedia_summary IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN location_quip IS NOT NULL THEN 1 ELSE 0 END
      ) >= 2
    `);
    const result = await stmt.all<{ taxon_id: number }>();
    return new Set(result.results.map(r => r.taxon_id));
  }

  async get(taxonId: number): Promise<TaxonEnrichment | null> {
    const stmt = this.db.prepare(
      'SELECT * FROM taxon_enrichment WHERE taxon_id = ?'
    ).bind(taxonId);

    const result = await stmt.first<D1Row>();
    return result ? rowToEnrichment(result) : null;
  }

  async put(taxonId: number, record: TaxonEnrichment): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO taxon_enrichment (
        taxon_id, taxon_name, common_name,
        diet, diet_source, habitats, habitats_source,
        continents, continents_source, iucn_status, iucn_source,
        body_mass_g, lifespan_years, locomotion, locomotion_source,
        wikipedia_summary, enriched_at, sources_attempted, schema_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      record.taxonId,
      record.taxonName,
      record.commonName ?? null,
      record.diet?.value ?? null,
      record.diet?.source ?? null,
      record.habitats ? JSON.stringify(record.habitats.value) : null,
      record.habitats?.source ?? null,
      record.continents ? JSON.stringify(record.continents.value) : null,
      record.continents?.source ?? null,
      record.iucnStatus?.value ?? null,
      record.iucnStatus?.source ?? null,
      record.bodyMassG?.value ?? null,
      record.lifespanYears?.value ?? null,
      record.locomotion?.value ?? null,
      record.locomotion?.source ?? null,
      record.wikipediaSummary?.value ?? null,
      record.enrichedAt,
      JSON.stringify(record.sourcesAttempted),
      record.schemaVersion
    );

    await stmt.run();
  }

  async list(taxonIds: number[]): Promise<Map<number, TaxonEnrichment>> {
    if (taxonIds.length === 0) return new Map();

    // D1 doesn't support arrays in bindings, so we query individually
    // For small lists this is fine; for large lists we'd batch
    const results = await Promise.all(
      taxonIds.map(async (id) => [id, await this.get(id)] as const),
    );

    const map = new Map<number, TaxonEnrichment>();
    for (const [id, rec] of results) {
      if (rec) map.set(id, rec);
    }
    return map;
  }

  /** Get stored location quip for a taxon */
  async getQuip(taxonId: number): Promise<string | null> {
    const stmt = this.db.prepare(
      'SELECT location_quip FROM taxon_enrichment WHERE taxon_id = ?'
    ).bind(taxonId);
    const result = await stmt.first<{ location_quip: string | null }>();
    return result?.location_quip ?? null;
  }

  /** Store a location quip for a taxon */
  async setQuip(taxonId: number, quip: string): Promise<void> {
    const stmt = this.db.prepare(
      'UPDATE taxon_enrichment SET location_quip = ? WHERE taxon_id = ?'
    ).bind(quip, taxonId);
    await stmt.run();
  }
}
