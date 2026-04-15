#!/usr/bin/env npx tsx
/**
 * Re-enrich taxa with sparse data (only 1-2 hints populated).
 *
 * Usage:
 *   npx tsx scripts/reenrich-sparse.ts [--max-hints 2] [--limit 100] [--dry-run]
 *
 * This script:
 * 1. Queries D1 for taxa with few populated hint fields
 * 2. Re-runs enrichment from Wikipedia + DBPedia
 * 3. Outputs SQL to update the database
 */

const DBPEDIA_SPARQL = 'https://dbpedia.org/sparql';

// The hint fields we count
const HINT_FIELDS = [
  'diet',
  'habitats',
  'continents',
  'iucn_status',
  'locomotion',
  'wikipedia_summary',
] as const;

interface SparseTaxon {
  taxon_id: number;
  taxon_name: string;
  common_name: string | null;
  hint_count: number;
  // Existing values
  diet: string | null;
  habitats: string | null;
  continents: string | null;
  iucn_status: string | null;
  locomotion: string | null;
  wikipedia_summary: string | null;
}

interface EnrichmentResult {
  diet?: string;
  habitats?: string[];
  continents?: string[];
  iucn_status?: string;
  locomotion?: string;
  wikipedia_summary?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Fetch Wikipedia summary
async function fetchWikipediaSummary(taxonName: string): Promise<string | null> {
  try {
    const searchName = taxonName.replace(/ /g, '_');
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(searchName)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'lifeguesser-enrichment/1.0' }
    });
    if (!res.ok) return null;
    const data = await res.json() as { extract?: string };
    return data.extract?.slice(0, 500) || null;
  } catch {
    return null;
  }
}

// Fetch from DBPedia
async function fetchDBPedia(taxonName: string): Promise<EnrichmentResult> {
  const result: EnrichmentResult = {};

  try {
    const searchName = taxonName.replace(/ /g, '_');
    const query = `
      PREFIX dbo: <http://dbpedia.org/ontology/>
      PREFIX dbr: <http://dbpedia.org/resource/>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

      SELECT ?diet ?habitat ?conservationStatus ?abstract WHERE {
        OPTIONAL { dbr:${searchName} dbo:diet ?dietRes . ?dietRes rdfs:label ?diet . FILTER(lang(?diet) = 'en') }
        OPTIONAL { dbr:${searchName} dbo:habitat ?habitatRes . ?habitatRes rdfs:label ?habitat . FILTER(lang(?habitat) = 'en') }
        OPTIONAL { dbr:${searchName} dbo:conservationStatus ?conservationStatus }
        OPTIONAL { dbr:${searchName} dbo:abstract ?abstract . FILTER(lang(?abstract) = 'en') }
      }
      LIMIT 1
    `;

    const url = `${DBPEDIA_SPARQL}?query=${encodeURIComponent(query)}&format=json`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'lifeguesser-enrichment/1.0' }
    });

    if (!res.ok) return result;

    const data = await res.json() as any;
    const bindings = data?.results?.bindings?.[0];

    if (bindings) {
      if (bindings.diet?.value) {
        const diet = bindings.diet.value.toLowerCase();
        if (diet.includes('carnivor')) result.diet = 'carnivore';
        else if (diet.includes('herbivor')) result.diet = 'herbivore';
        else if (diet.includes('omnivor')) result.diet = 'omnivore';
      }

      if (bindings.habitat?.value) {
        const habitat = bindings.habitat.value.toLowerCase();
        const habitats: string[] = [];
        if (habitat.includes('forest')) habitats.push('forest');
        if (habitat.includes('grass') || habitat.includes('savanna')) habitats.push('grassland');
        if (habitat.includes('wetland') || habitat.includes('swamp') || habitat.includes('marsh')) habitats.push('wetland');
        if (habitat.includes('desert')) habitats.push('desert');
        if (habitat.includes('marine') || habitat.includes('ocean') || habitat.includes('sea')) habitats.push('marine');
        if (habitat.includes('freshwater') || habitat.includes('river') || habitat.includes('lake')) habitats.push('freshwater');
        if (habitat.includes('urban') || habitat.includes('city')) habitats.push('urban');
        if (habitat.includes('mountain') || habitat.includes('alpine')) habitats.push('mountain');
        if (habitats.length > 0) result.habitats = habitats;
      }

      if (bindings.conservationStatus?.value) {
        const status = bindings.conservationStatus.value.toUpperCase();
        if (status.includes('LC') || status.includes('LEAST')) result.iucn_status = 'LC';
        else if (status.includes('NT') || status.includes('NEAR')) result.iucn_status = 'NT';
        else if (status.includes('VU') || status.includes('VULNERABLE')) result.iucn_status = 'VU';
        else if (status.includes('EN') || status.includes('ENDANGERED')) result.iucn_status = 'EN';
        else if (status.includes('CR') || status.includes('CRITICAL')) result.iucn_status = 'CR';
      }

      // Use DBPedia abstract if we don't have Wikipedia summary
      if (bindings.abstract?.value && !result.wikipedia_summary) {
        result.wikipedia_summary = bindings.abstract.value.slice(0, 500);
      }
    }
  } catch (e) {
    console.warn(`DBPedia fetch failed for ${taxonName}:`, e);
  }

  return result;
}

// Infer locomotion from taxon ancestry or name
function inferLocomotion(taxonName: string, existingData: SparseTaxon): string | null {
  const name = taxonName.toLowerCase();

  // Birds
  if (name.includes('bird') || name.includes('eagle') || name.includes('hawk') ||
      name.includes('owl') || name.includes('sparrow') || name.includes('finch')) {
    return 'aerial';
  }

  // Fish
  if (name.includes('fish') || name.includes('shark') || name.includes('ray') ||
      name.includes('salmon') || name.includes('trout') || name.includes('bass')) {
    return 'aquatic';
  }

  // Whales/dolphins
  if (name.includes('whale') || name.includes('dolphin') || name.includes('porpoise')) {
    return 'aquatic';
  }

  // Primates (often arboreal)
  if (name.includes('monkey') || name.includes('chimp') || name.includes('orangutan') ||
      name.includes('gibbon') || name.includes('lemur')) {
    return 'arboreal';
  }

  // Burrowing animals
  if (name.includes('mole') || name.includes('gopher') || name.includes('badger')) {
    return 'fossorial';
  }

  return null;
}

// Generate SQL for updating a taxon
function generateUpdateSQL(taxon: SparseTaxon, newData: EnrichmentResult): string | null {
  const updates: string[] = [];
  const now = Math.floor(Date.now() / 1000);

  if (newData.diet && !taxon.diet) {
    updates.push(`diet = '${newData.diet}'`);
    updates.push(`diet_source = 'dbpedia'`);
  }

  if (newData.habitats && !taxon.habitats) {
    updates.push(`habitats = '${JSON.stringify(newData.habitats).replace(/'/g, "''")}'`);
    updates.push(`habitats_source = 'dbpedia'`);
  }

  if (newData.continents && !taxon.continents) {
    updates.push(`continents = '${JSON.stringify(newData.continents).replace(/'/g, "''")}'`);
    updates.push(`continents_source = 'dbpedia'`);
  }

  if (newData.iucn_status && !taxon.iucn_status) {
    updates.push(`iucn_status = '${newData.iucn_status}'`);
    updates.push(`iucn_source = 'dbpedia'`);
  }

  if (newData.locomotion && !taxon.locomotion) {
    updates.push(`locomotion = '${newData.locomotion}'`);
    updates.push(`locomotion_source = 'inferred'`);
  }

  if (newData.wikipedia_summary && !taxon.wikipedia_summary) {
    updates.push(`wikipedia_summary = '${newData.wikipedia_summary.replace(/'/g, "''")}'`);
  }

  if (updates.length === 0) return null;

  updates.push(`enriched_at = ${now}`);

  return `UPDATE taxon_enrichment SET ${updates.join(', ')} WHERE taxon_id = ${taxon.taxon_id};`;
}

async function main() {
  const args = process.argv.slice(2);
  const maxHints = parseInt(args.find(a => a.startsWith('--max-hints='))?.split('=')[1] || '2');
  const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '100');
  const dryRun = args.includes('--dry-run');

  console.log(`Re-enriching taxa with <= ${maxHints} hints (limit: ${limit}, dry-run: ${dryRun})`);
  console.log('');

  // Query to find sparse taxa - run this against D1
  console.log('-- Step 1: Run this query in D1 console to get sparse taxa:');
  console.log(`
SELECT
  taxon_id,
  taxon_name,
  common_name,
  diet,
  habitats,
  continents,
  iucn_status,
  locomotion,
  wikipedia_summary,
  (CASE WHEN diet IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN habitats IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN continents IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN iucn_status IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN locomotion IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN wikipedia_summary IS NOT NULL THEN 1 ELSE 0 END) as hint_count
FROM taxon_enrichment
WHERE (CASE WHEN diet IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN habitats IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN continents IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN iucn_status IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN locomotion IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN wikipedia_summary IS NOT NULL THEN 1 ELSE 0 END) <= ${maxHints}
ORDER BY hint_count ASC
LIMIT ${limit};
`);

  console.log('-- Step 2: Export results as JSON and save to sparse-taxa.json');
  console.log('-- Step 3: Run: npx tsx scripts/reenrich-sparse.ts --process sparse-taxa.json');
  console.log('');

  // Check if we're processing a file
  const processFile = args.find(a => a.startsWith('--process='))?.split('=')[1];
  if (!processFile) {
    console.log('No --process= argument provided. Follow steps above to get sparse taxa.');
    return;
  }

  // Load the sparse taxa from file
  const fs = await import('fs/promises');
  const data = await fs.readFile(processFile, 'utf-8');
  const sparseTaxa: SparseTaxon[] = JSON.parse(data);

  console.log(`Processing ${sparseTaxa.length} sparse taxa...`);
  console.log('');

  const sqlStatements: string[] = [];

  for (let i = 0; i < sparseTaxa.length; i++) {
    const taxon = sparseTaxa[i];
    console.log(`[${i + 1}/${sparseTaxa.length}] ${taxon.taxon_name} (${taxon.hint_count} hints)`);

    // Fetch new data
    const enrichment: EnrichmentResult = {};

    // Try Wikipedia first
    if (!taxon.wikipedia_summary) {
      const summary = await fetchWikipediaSummary(taxon.taxon_name);
      if (summary) enrichment.wikipedia_summary = summary;
      await sleep(200);
    }

    // Try DBPedia
    const dbpediaData = await fetchDBPedia(taxon.taxon_name);
    Object.assign(enrichment, dbpediaData);
    await sleep(300);

    // Infer locomotion if missing
    if (!taxon.locomotion && !enrichment.locomotion) {
      const inferred = inferLocomotion(taxon.taxon_name, taxon);
      if (inferred) enrichment.locomotion = inferred;
    }

    // Generate SQL
    const sql = generateUpdateSQL(taxon, enrichment);
    if (sql) {
      sqlStatements.push(sql);
      const newFields = Object.keys(enrichment).filter(k => (enrichment as any)[k]);
      console.log(`  -> Found: ${newFields.join(', ') || 'nothing new'}`);
    } else {
      console.log(`  -> No new data found`);
    }
  }

  console.log('');
  console.log(`Generated ${sqlStatements.length} UPDATE statements`);
  console.log('');

  if (dryRun) {
    console.log('-- DRY RUN - SQL statements:');
    console.log(sqlStatements.join('\n'));
  } else {
    // Write to file
    const outputFile = 'reenrich-updates.sql';
    const fs = await import('fs/promises');
    await fs.writeFile(outputFile, sqlStatements.join('\n'));
    console.log(`SQL written to ${outputFile}`);
    console.log('Run: npx wrangler d1 execute lifeguesser-db --remote --file=reenrich-updates.sql');
  }
}

main().catch(console.error);
