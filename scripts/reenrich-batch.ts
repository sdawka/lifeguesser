#!/usr/bin/env npx tsx
/**
 * Batch re-enrich sparse taxa using Wikipedia + DBPedia.
 *
 * Usage:
 *   npx wrangler d1 execute lifeguesser-db --remote --command "SELECT taxon_id, taxon_name FROM taxon_enrichment WHERE ..." --json > sparse.json
 *   npx tsx scripts/reenrich-batch.ts sparse.json
 *   npx wrangler d1 execute lifeguesser-db --remote --file=reenrich.sql
 */

const DBPEDIA_SPARQL = 'https://dbpedia.org/sparql';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

async function fetchDBPedia(taxonName: string): Promise<{
  diet?: string;
  habitats?: string[];
  iucn_status?: string;
  locomotion?: string;
}> {
  const result: any = {};

  try {
    const searchName = taxonName.replace(/ /g, '_');
    const query = `
      PREFIX dbo: <http://dbpedia.org/ontology/>
      PREFIX dbr: <http://dbpedia.org/resource/>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX dbp: <http://dbpedia.org/property/>

      SELECT ?diet ?habitat ?conservationStatus ?order ?family ?class WHERE {
        OPTIONAL { dbr:${searchName} dbp:diet ?diet }
        OPTIONAL { dbr:${searchName} dbo:conservationStatus ?conservationStatus }
        OPTIONAL { dbr:${searchName} dbo:order ?orderRes . ?orderRes rdfs:label ?order . FILTER(lang(?order) = 'en') }
        OPTIONAL { dbr:${searchName} dbo:family ?familyRes . ?familyRes rdfs:label ?family . FILTER(lang(?family) = 'en') }
        OPTIONAL { dbr:${searchName} dbo:class ?classRes . ?classRes rdfs:label ?class . FILTER(lang(?class) = 'en') }
      }
      LIMIT 1
    `;

    const url = `${DBPEDIA_SPARQL}?query=${encodeURIComponent(query)}&format=json`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'lifeguesser-enrichment/1.0', 'Accept': 'application/json' }
    });

    if (!res.ok) return result;

    const data = await res.json() as any;
    const bindings = data?.results?.bindings?.[0];

    if (bindings) {
      // Diet
      if (bindings.diet?.value) {
        const diet = String(bindings.diet.value).toLowerCase();
        if (diet.includes('carnivor') || diet.includes('meat') || diet.includes('insect') || diet.includes('fish')) {
          result.diet = 'carnivore';
        } else if (diet.includes('herbivor') || diet.includes('plant') || diet.includes('seed') || diet.includes('fruit') || diet.includes('nectar')) {
          result.diet = 'herbivore';
        } else if (diet.includes('omnivor')) {
          result.diet = 'omnivore';
        }
      }

      // Conservation status
      if (bindings.conservationStatus?.value) {
        const status = String(bindings.conservationStatus.value).toUpperCase();
        if (status.includes('LC') || status.includes('LEAST')) result.iucn_status = 'LC';
        else if (status.includes('NT') || status.includes('NEAR')) result.iucn_status = 'NT';
        else if (status.includes('VU') || status.includes('VULNERABLE')) result.iucn_status = 'VU';
        else if (status.includes('EN') && !status.includes('NEAR')) result.iucn_status = 'EN';
        else if (status.includes('CR') || status.includes('CRITICAL')) result.iucn_status = 'CR';
      }

      // Infer locomotion from class/order
      const classOrOrder = (bindings.class?.value || bindings.order?.value || '').toLowerCase();
      if (classOrOrder.includes('aves') || classOrOrder.includes('bird')) {
        result.locomotion = 'aerial';
      } else if (classOrOrder.includes('fish') || classOrOrder.includes('pisces') || classOrOrder.includes('chondrichthyes')) {
        result.locomotion = 'aquatic';
      } else if (classOrOrder.includes('cetacea') || classOrOrder.includes('whale') || classOrOrder.includes('dolphin')) {
        result.locomotion = 'aquatic';
      } else if (classOrOrder.includes('primat')) {
        result.locomotion = 'arboreal';
      }
    }
  } catch (e) {
    // Ignore errors
  }

  return result;
}

// Infer locomotion from common bird/fish/mammal patterns
function inferLocomotion(taxonName: string): string | null {
  const name = taxonName.toLowerCase();

  // Common bird genera/families
  const birdPatterns = ['parus', 'turdus', 'corvus', 'falco', 'aquila', 'buteo', 'accipiter',
    'passer', 'fringilla', 'carduelis', 'sturnus', 'hirundo', 'apus', 'columba',
    'streptopelia', 'cuculus', 'strix', 'bubo', 'athene', 'alcedo', 'merops',
    'picus', 'dendrocopos', 'anas', 'anser', 'cygnus', 'ardea', 'egretta',
    'phalacrocorax', 'pelecanus', 'larus', 'sterna', 'puffinus', 'morus'];

  if (birdPatterns.some(p => name.includes(p))) return 'aerial';

  // Fish patterns
  const fishPatterns = ['salmo', 'oncorhynchus', 'esox', 'perca', 'sander',
    'cyprinus', 'carassius', 'barbus', 'leuciscus', 'rutilus', 'gadus',
    'pleuronectes', 'solea', 'raja', 'squalus', 'carcharhinus'];

  if (fishPatterns.some(p => name.includes(p))) return 'aquatic';

  return null;
}

async function main() {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.log('Usage: npx tsx scripts/reenrich-batch.ts <input.json>');
    console.log('');
    console.log('First, export sparse taxa:');
    console.log('  npx wrangler d1 execute lifeguesser-db --remote --json \\');
    console.log('    --command "SELECT taxon_id, taxon_name FROM taxon_enrichment WHERE (CASE WHEN diet IS NOT NULL THEN 1 ELSE 0 END + CASE WHEN habitats IS NOT NULL THEN 1 ELSE 0 END + CASE WHEN continents IS NOT NULL THEN 1 ELSE 0 END + CASE WHEN iucn_status IS NOT NULL THEN 1 ELSE 0 END + CASE WHEN locomotion IS NOT NULL THEN 1 ELSE 0 END + CASE WHEN wikipedia_summary IS NOT NULL THEN 1 ELSE 0 END) <= 1 LIMIT 500" \\');
    console.log('    > sparse.json');
    return;
  }

  const fs = await import('fs/promises');
  const raw = await fs.readFile(inputFile, 'utf-8');
  const data = JSON.parse(raw);

  // Handle wrangler JSON output format
  const taxa = data[0]?.results || data.results || data;

  console.log(`Processing ${taxa.length} sparse taxa...`);

  const updates: string[] = [];
  let enriched = 0;

  for (let i = 0; i < taxa.length; i++) {
    const { taxon_id, taxon_name } = taxa[i];
    process.stdout.write(`[${i + 1}/${taxa.length}] ${taxon_name}...`);

    const fields: string[] = [];
    const now = Math.floor(Date.now() / 1000);

    // Try Wikipedia
    const wiki = await fetchWikipediaSummary(taxon_name);
    if (wiki) {
      fields.push(`wikipedia_summary = '${wiki.replace(/'/g, "''")}'`);
    }
    await sleep(150);

    // Try DBPedia
    const dbp = await fetchDBPedia(taxon_name);
    if (dbp.diet) {
      fields.push(`diet = '${dbp.diet}'`);
      fields.push(`diet_source = 'dbpedia'`);
    }
    if (dbp.iucn_status) {
      fields.push(`iucn_status = '${dbp.iucn_status}'`);
      fields.push(`iucn_source = 'dbpedia'`);
    }
    if (dbp.locomotion) {
      fields.push(`locomotion = '${dbp.locomotion}'`);
      fields.push(`locomotion_source = 'dbpedia'`);
    }
    await sleep(200);

    // Fallback: infer locomotion
    if (!dbp.locomotion) {
      const inferred = inferLocomotion(taxon_name);
      if (inferred) {
        fields.push(`locomotion = '${inferred}'`);
        fields.push(`locomotion_source = 'inferred'`);
      }
    }

    if (fields.length > 0) {
      fields.push(`enriched_at = ${now}`);
      updates.push(`UPDATE taxon_enrichment SET ${fields.join(', ')} WHERE taxon_id = ${taxon_id};`);
      enriched++;
      console.log(` +${fields.length / 2 | 0} fields`);
    } else {
      console.log(' no new data');
    }
  }

  console.log('');
  console.log(`Enriched ${enriched}/${taxa.length} taxa`);

  if (updates.length > 0) {
    const outFile = 'reenrich.sql';
    await fs.writeFile(outFile, updates.join('\n'));
    console.log(`SQL written to ${outFile}`);
    console.log(`Run: npx wrangler d1 execute lifeguesser-db --remote --file=${outFile}`);
  }
}

main().catch(console.error);
