#!/usr/bin/env npx tsx
/**
 * Pre-populate taxon enrichment data for common species.
 *
 * Usage:
 *   npx tsx scripts/populate-taxa.ts [--count 500] [--skip 0]
 *
 * This script:
 * 1. Fetches most-observed taxa from iNaturalist
 * 2. Enriches each with Wikipedia + DBPedia
 * 3. Generates SQL for D1 database
 */

const INAT_API = 'https://api.inaturalist.org/v1';
const DBPEDIA_SPARQL = 'https://dbpedia.org/sparql';

interface TaxonResult {
  id: number;
  name: string;
  preferred_common_name?: string;
  rank: string;
  observations_count: number;
  wikipedia_url?: string;
}

interface EnrichedTaxon {
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
  enriched_at: number;
  sources_attempted: string;
  schema_version: number;
}

// Fetch popular taxa from iNaturalist
async function fetchPopularTaxa(count: number, skip: number): Promise<TaxonResult[]> {
  const perPage = Math.min(count, 200);
  const pages = Math.ceil(count / perPage);
  const allTaxa: TaxonResult[] = [];

  // Calculate starting page from skip (1-indexed)
  const startPage = Math.floor(skip / perPage) + 1;

  for (let i = 0; i < pages; i++) {
    const page = startPage + i;
    const url = `${INAT_API}/taxa?rank=species&order_by=observations_count&order=desc&per_page=${perPage}&page=${page}`;

    console.log(`Fetching taxa page ${page} (batch ${i + 1}/${pages})...`);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'lifeguesser-enrichment/1.0' }
    });

    if (!res.ok) {
      console.error(`iNat API error: ${res.status}`);
      break;
    }

    const data = await res.json() as { results: TaxonResult[] };
    allTaxa.push(...data.results);

    // Rate limit
    await sleep(500);
  }

  // Handle partial page offset
  const pageOffset = skip % perPage;
  return allTaxa.slice(pageOffset, pageOffset + count);
}

interface DBPediaResult {
  abstract?: string;
  conservationStatus?: string;
  habitat?: string;
  diet?: string;
  mass?: number;
  lifespan?: number;
}

// Query DBPedia SPARQL endpoint for species data
async function fetchDBPediaData(taxonName: string): Promise<DBPediaResult | null> {
  try {
    // DBPedia uses underscores for spaces in URIs
    const dbpediaName = taxonName.trim().replace(/\s+/g, '_');

    const query = `
      PREFIX dbo: <http://dbpedia.org/ontology/>
      PREFIX dbr: <http://dbpedia.org/resource/>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

      SELECT ?abstract ?conservationStatus ?habitat ?diet ?mass ?lifespan WHERE {
        OPTIONAL { dbr:${dbpediaName} dbo:abstract ?abstract . FILTER(LANG(?abstract) = "en") }
        OPTIONAL { dbr:${dbpediaName} dbo:conservationStatus ?conservationStatus }
        OPTIONAL { dbr:${dbpediaName} dbo:habitat ?habitat }
        OPTIONAL { dbr:${dbpediaName} dbo:diet ?diet }
        OPTIONAL { dbr:${dbpediaName} dbo:weight ?mass }
        OPTIONAL { dbr:${dbpediaName} dbo:lifespan ?lifespan }
      } LIMIT 1
    `;

    const url = `${DBPEDIA_SPARQL}?query=${encodeURIComponent(query)}&format=json`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'lifeguesser-enrichment/1.0',
        'Accept': 'application/sparql-results+json',
      }
    });

    if (!res.ok) return null;

    const data = await res.json() as {
      results: {
        bindings: Array<{
          abstract?: { value: string };
          conservationStatus?: { value: string };
          habitat?: { value: string };
          diet?: { value: string };
          mass?: { value: string };
          lifespan?: { value: string };
        }>;
      };
    };

    const binding = data.results.bindings[0];
    if (!binding) return null;

    return {
      abstract: binding.abstract?.value,
      conservationStatus: binding.conservationStatus?.value,
      habitat: binding.habitat?.value,
      diet: binding.diet?.value,
      mass: binding.mass?.value ? parseFloat(binding.mass.value) : undefined,
      lifespan: binding.lifespan?.value ? parseFloat(binding.lifespan.value) : undefined,
    };
  } catch (err) {
    console.error(`  DBPedia error: ${err}`);
    return null;
  }
}

// Map DBPedia conservation status to IUCN codes
function mapConservationStatus(status: string | undefined): string | null {
  if (!status) return null;
  const lower = status.toLowerCase();
  if (lower.includes('critically') || lower.includes('cr')) return 'CR';
  if (lower.includes('endangered') || lower.includes('en')) return 'EN';
  if (lower.includes('vulnerable') || lower.includes('vu')) return 'VU';
  if (lower.includes('near') || lower.includes('nt')) return 'NT';
  if (lower.includes('least') || lower.includes('lc')) return 'LC';
  if (lower.includes('data deficient') || lower.includes('dd')) return 'DD';
  return null;
}

// Fetch Wikipedia summary
async function fetchWikipediaSummary(taxonName: string): Promise<string | null> {
  try {
    const title = encodeURIComponent(taxonName.trim().replace(/\s+/g, '_'));
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${title}`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'lifeguesser-enrichment/1.0',
        Accept: 'application/json',
      }
    });

    if (!res.ok) return null;

    const json = await res.json() as { extract?: string; type?: string };
    if (json.type === 'disambiguation') return null;

    return json.extract?.trim() || null;
  } catch {
    return null;
  }
}

// Extract structured traits from text using simple heuristics
function extractTraits(text: string, _taxonName: string): Partial<EnrichedTaxon> {
  const traits: Partial<EnrichedTaxon> = {};
  const lower = text.toLowerCase();

  // Diet detection
  if (lower.includes('carnivore') || lower.includes('carnivorous') || lower.includes('predator') || lower.includes('eats meat')) {
    traits.diet = 'carnivore';
  } else if (lower.includes('herbivore') || lower.includes('herbivorous') || lower.includes('plant-eating') || lower.includes('grazer')) {
    traits.diet = 'herbivore';
  } else if (lower.includes('omnivore') || lower.includes('omnivorous')) {
    traits.diet = 'omnivore';
  }

  // Habitat detection
  const habitats: string[] = [];
  if (lower.includes('forest') || lower.includes('woodland')) habitats.push('forest');
  if (lower.includes('grassland') || lower.includes('savanna') || lower.includes('prairie')) habitats.push('grassland');
  if (lower.includes('wetland') || lower.includes('marsh') || lower.includes('swamp')) habitats.push('wetland');
  if (lower.includes('desert') || lower.includes('arid')) habitats.push('desert');
  if (lower.includes('marine') || lower.includes('ocean') || lower.includes('sea')) habitats.push('marine');
  if (lower.includes('freshwater') || lower.includes('river') || lower.includes('lake') || lower.includes('stream')) habitats.push('freshwater');
  if (lower.includes('urban') || lower.includes('city') || lower.includes('suburban')) habitats.push('urban');
  if (lower.includes('mountain') || lower.includes('alpine')) habitats.push('mountain');
  if (habitats.length > 0) traits.habitats = JSON.stringify(habitats);

  // Continent detection
  const continents: string[] = [];
  if (lower.includes('africa') || lower.includes('african')) continents.push('africa');
  if (lower.includes('asia') || lower.includes('asian')) continents.push('asia');
  if (lower.includes('europe') || lower.includes('european')) continents.push('europe');
  if (lower.includes('north america') || lower.includes('american') || lower.includes('united states') || lower.includes('canada') || lower.includes('mexico')) continents.push('north_america');
  if (lower.includes('south america') || lower.includes('brazil') || lower.includes('amazon')) continents.push('south_america');
  if (lower.includes('australia') || lower.includes('oceania') || lower.includes('pacific')) continents.push('oceania');
  if (lower.includes('antarctica') || lower.includes('antarctic')) continents.push('antarctica');
  if (continents.length > 0) traits.continents = JSON.stringify(continents);

  // Locomotion detection
  if (lower.includes('flying') || lower.includes('flight') || lower.includes('aerial')) {
    traits.locomotion = 'aerial';
  } else if (lower.includes('swimming') || lower.includes('aquatic')) {
    traits.locomotion = 'aquatic';
  } else if (lower.includes('burrowing') || lower.includes('underground') || lower.includes('fossorial')) {
    traits.locomotion = 'fossorial';
  } else if (lower.includes('arboreal') || lower.includes('tree-dwelling') || lower.includes('trees')) {
    traits.locomotion = 'arboreal';
  }

  // IUCN status detection
  if (lower.includes('critically endangered')) traits.iucn_status = 'CR';
  else if (lower.includes('endangered')) traits.iucn_status = 'EN';
  else if (lower.includes('vulnerable')) traits.iucn_status = 'VU';
  else if (lower.includes('near threatened')) traits.iucn_status = 'NT';
  else if (lower.includes('least concern')) traits.iucn_status = 'LC';

  return traits;
}

// Enrich a single taxon
async function enrichTaxon(taxon: TaxonResult): Promise<EnrichedTaxon> {
  const sources: string[] = [];
  let summary: string | null = null;
  let traits: Partial<EnrichedTaxon> = {};

  // Try Wikipedia first
  console.log(`  Wikipedia: ${taxon.name}...`);
  summary = await fetchWikipediaSummary(taxon.name);
  if (summary) {
    sources.push('wikipedia');
    traits = extractTraits(summary, taxon.name);
  }

  // Try DBPedia for structured data
  console.log(`  DBPedia: ${taxon.name}...`);
  const dbpediaData = await fetchDBPediaData(taxon.name);
  if (dbpediaData) {
    sources.push('dbpedia');

    // Use DBPedia abstract if no Wikipedia summary
    if (!summary && dbpediaData.abstract) {
      summary = dbpediaData.abstract;
      traits = extractTraits(dbpediaData.abstract, taxon.name);
    }

    // Structured data from DBPedia (higher quality than text extraction)
    if (dbpediaData.conservationStatus) {
      const iucn = mapConservationStatus(dbpediaData.conservationStatus);
      if (iucn && !traits.iucn_status) {
        traits.iucn_status = iucn;
        traits.iucn_source = 'dbpedia';
      }
    }

    if (dbpediaData.mass && !traits.body_mass_g) {
      // DBPedia mass is often in kg, convert to grams
      traits.body_mass_g = dbpediaData.mass * 1000;
    }

    if (dbpediaData.lifespan && !traits.lifespan_years) {
      traits.lifespan_years = dbpediaData.lifespan;
    }

    // Extract traits from DBPedia text fields
    if (dbpediaData.habitat) {
      const habitatTraits = extractTraits(dbpediaData.habitat, taxon.name);
      if (habitatTraits.habitats && !traits.habitats) {
        traits.habitats = habitatTraits.habitats;
        traits.habitats_source = 'dbpedia';
      }
    }

    if (dbpediaData.diet) {
      const dietTraits = extractTraits(dbpediaData.diet, taxon.name);
      if (dietTraits.diet && !traits.diet) {
        traits.diet = dietTraits.diet;
        traits.diet_source = 'dbpedia';
      }
    }
  }
  await sleep(100); // DBPedia rate limit

  const now = Math.floor(Date.now() / 1000);

  return {
    taxon_id: taxon.id,
    taxon_name: taxon.name,
    common_name: taxon.preferred_common_name || null,
    diet: traits.diet || null,
    diet_source: traits.diet ? sources[0] : null,
    habitats: traits.habitats || null,
    habitats_source: traits.habitats ? sources[0] : null,
    continents: traits.continents || null,
    continents_source: traits.continents ? sources[0] : null,
    iucn_status: traits.iucn_status || null,
    iucn_source: traits.iucn_status ? sources[0] : null,
    body_mass_g: traits.body_mass_g ?? null,
    lifespan_years: traits.lifespan_years ?? null,
    locomotion: traits.locomotion || null,
    locomotion_source: traits.locomotion ? sources[0] : null,
    wikipedia_summary: summary,
    enriched_at: now,
    sources_attempted: JSON.stringify(sources),
    schema_version: 1,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Generate SQL insert statements
function generateSQL(taxa: EnrichedTaxon[]): string {
  const statements: string[] = [];

  for (const t of taxa) {
    const escapeSql = (s: string | null) => s ? `'${s.replace(/'/g, "''")}'` : 'NULL';

    statements.push(`INSERT OR REPLACE INTO taxon_enrichment (
      taxon_id, taxon_name, common_name,
      diet, diet_source, habitats, habitats_source,
      continents, continents_source, iucn_status, iucn_source,
      body_mass_g, lifespan_years, locomotion, locomotion_source,
      wikipedia_summary, enriched_at, sources_attempted, schema_version
    ) VALUES (
      ${t.taxon_id}, ${escapeSql(t.taxon_name)}, ${escapeSql(t.common_name)},
      ${escapeSql(t.diet)}, ${escapeSql(t.diet_source)},
      ${escapeSql(t.habitats)}, ${escapeSql(t.habitats_source)},
      ${escapeSql(t.continents)}, ${escapeSql(t.continents_source)},
      ${escapeSql(t.iucn_status)}, ${escapeSql(t.iucn_source)},
      ${t.body_mass_g ?? 'NULL'}, ${t.lifespan_years ?? 'NULL'},
      ${escapeSql(t.locomotion)}, ${escapeSql(t.locomotion_source)},
      ${escapeSql(t.wikipedia_summary)},
      ${t.enriched_at}, ${escapeSql(t.sources_attempted)}, ${t.schema_version}
    );`);
  }

  return statements.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  let count = 100;
  let skip = 0;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--count' && args[i + 1]) count = parseInt(args[i + 1], 10);
    if (args[i] === '--skip' && args[i + 1]) skip = parseInt(args[i + 1], 10);
  }

  console.log(`\nFetching ${count} popular taxa (skip ${skip})...\n`);
  const taxa = await fetchPopularTaxa(count, skip);
  console.log(`Got ${taxa.length} taxa\n`);

  const enriched: EnrichedTaxon[] = [];

  for (let i = 0; i < taxa.length; i++) {
    const taxon = taxa[i];
    console.log(`[${i + 1}/${taxa.length}] ${taxon.name} (${taxon.preferred_common_name || 'no common name'})`);

    try {
      const result = await enrichTaxon(taxon);
      enriched.push(result);

      // Progress indicator
      const hasData = result.wikipedia_summary || result.diet || result.habitats;
      console.log(`  -> ${hasData ? 'enriched' : 'sparse'}\n`);
    } catch (err) {
      console.error(`  -> ERROR: ${err}\n`);
    }

    // Rate limiting
    await sleep(300);
  }

  // Generate SQL file
  const sql = generateSQL(enriched);
  const outputPath = `scripts/enrichment-${Date.now()}.sql`;
  const fs = await import('fs/promises');
  await fs.writeFile(outputPath, sql);

  console.log(`\nGenerated ${outputPath}`);
  console.log(`Run: npx wrangler d1 execute lifeguesser-db --local --file=${outputPath}`);
  console.log(`Or for production: npx wrangler d1 execute lifeguesser-db --remote --file=${outputPath}`);

  // Stats
  const withSummary = enriched.filter(t => t.wikipedia_summary).length;
  const withDiet = enriched.filter(t => t.diet).length;
  const withHabitat = enriched.filter(t => t.habitats).length;

  console.log(`\nStats:`);
  console.log(`  Total: ${enriched.length}`);
  console.log(`  With summary: ${withSummary} (${Math.round(withSummary / enriched.length * 100)}%)`);
  console.log(`  With diet: ${withDiet} (${Math.round(withDiet / enriched.length * 100)}%)`);
  console.log(`  With habitat: ${withHabitat} (${Math.round(withHabitat / enriched.length * 100)}%)`);
}

main().catch(console.error);
