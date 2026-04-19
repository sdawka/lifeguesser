#!/usr/bin/env npx tsx
/**
 * Pre-populate the `observations` D1 table with iNaturalist specimens.
 *
 * For each (category × continent) bucket, fetch the top N species and a few
 * research-grade observations per species. Emits SQL files to be applied via:
 *   npx wrangler d1 execute lifeguesser-db --local  --file=scripts/observations-<ts>.sql
 *   npx wrangler d1 execute lifeguesser-db --remote --file=scripts/observations-<ts>.sql
 *
 * Usage:
 *   npx tsx scripts/populate-observations.ts [--species 10] [--obs 5]
 */

import { writeFile } from 'node:fs/promises';

const INAT_API = 'https://api.inaturalist.org/v1';
const HEADERS = { 'User-Agent': 'lifeguesser-seed/1.0', Accept: 'application/json' };
const SLEEP_MS = 1100;           // iNat soft cap is ~60 req/min; stay comfortably under it
const ANCESTRY_SLEEP_MS = 1100;
const MAX_RETRIES = 4;

type ContinentCode = 'NA' | 'SA' | 'EU' | 'AF' | 'AS' | 'OC';

const CATEGORIES: { label: string; taxonId: number }[] = [
  { label: 'Birds',      taxonId: 3 },
  { label: 'Mammals',    taxonId: 40151 },
  { label: 'Reptiles',   taxonId: 26036 },
  { label: 'Amphibians', taxonId: 20978 },
  { label: 'Fishes',     taxonId: 47178 },
  { label: 'Insects',    taxonId: 47158 },
  { label: 'Plants',     taxonId: 47126 },
  { label: 'Fungi',      taxonId: 47170 },
];

const CONTINENTS: { code: ContinentCode; placeId: number; label: string }[] = [
  { code: 'NA', placeId: 97394, label: 'North America' },
  { code: 'SA', placeId: 97389, label: 'South America' },
  { code: 'EU', placeId: 97391, label: 'Europe' },
  { code: 'AF', placeId: 97392, label: 'Africa' },
  { code: 'AS', placeId: 97395, label: 'Asia' },
  { code: 'OC', placeId: 97393, label: 'Oceania' },
];

const ANCESTRY_RANKS = ['kingdom', 'class', 'order', 'family'] as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface SeedRow {
  id: number;
  taxonId: number;
  taxonName: string;
  lat: number;
  lng: number;
  photoUrls: string[];
  observerLogin: string;
  license: string | null;
  observationUrl: string;
  ancestorIds: number[];
  ancestry: { rank: string; name: string }[];
  categoryId: number;
  continent: ContinentCode;
}

interface TaxonStub {
  taxonId: number;
  taxonName: string;
}

async function inatGet<T>(path: string): Promise<T> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetch(`${INAT_API}${path}`, { headers: HEADERS });
    if (res.ok) return res.json() as Promise<T>;
    if (res.status !== 429 && res.status < 500) {
      throw new Error(`iNat ${res.status}: ${path}`);
    }
    const backoff = Math.min(30_000, 2000 * Math.pow(2, attempt));
    lastErr = new Error(`iNat ${res.status}: ${path}`);
    await sleep(backoff);
  }
  throw lastErr instanceof Error ? lastErr : new Error(`iNat retries exhausted: ${path}`);
}

async function topSpecies(categoryId: number, placeId: number, limit: number): Promise<{ id: number; name: string }[]> {
  const data = await inatGet<{ results: Array<{ taxon: { id: number; name: string; rank: string } }> }>(
    `/observations/species_counts?taxon_id=${categoryId}&place_id=${placeId}&per_page=${limit}`,
  );
  return (data.results ?? [])
    .map((r) => r.taxon)
    .filter((t) => t && t.rank === 'species')
    .map((t) => ({ id: t.id, name: t.name }));
}

async function fetchObservations(
  taxonId: number,
  placeId: number,
  perTaxon: number,
  categoryId: number,
  continent: ContinentCode,
): Promise<SeedRow[]> {
  const data = await inatGet<{ results: any[] }>(
    `/observations?taxon_id=${taxonId}&place_id=${placeId}` +
    `&quality_grade=research&photos=true&geoprivacy=open` +
    `&per_page=${perTaxon}&order_by=random`,
  );

  const out: SeedRow[] = [];
  for (const r of data.results ?? []) {
    const photoUrls: string[] = (r?.photos ?? [])
      .map((p: any) => p?.url)
      .filter(Boolean)
      .map((u: string) => String(u).replace('/square.', '/large.'));
    if (!photoUrls.length) continue;

    const loc: string | undefined = r?.location;
    if (!loc || typeof loc !== 'string') continue;
    const [latStr, lngStr] = loc.split(',');
    const lat = Number(latStr);
    const lng = Number(lngStr);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const taxonName: string =
      r?.taxon?.preferred_common_name || r?.taxon?.name || 'Unknown';
    const obsTaxonId: number = Number.isFinite(r?.taxon?.id) ? Number(r.taxon.id) : taxonId;
    const ancestorIds: number[] = Array.isArray(r?.taxon?.ancestor_ids)
      ? r.taxon.ancestor_ids.filter((n: any) => Number.isFinite(n))
      : [];

    out.push({
      id: Number(r.id),
      taxonId: obsTaxonId,
      taxonName,
      lat,
      lng,
      photoUrls,
      observerLogin: r?.user?.login ?? 'unknown',
      license: r?.license_code ?? null,
      observationUrl: r?.uri ?? `https://www.inaturalist.org/observations/${r?.id}`,
      ancestorIds,
      ancestry: [],
      categoryId,
      continent,
    });
  }
  return out;
}

async function fetchAncestry(allIds: number[]): Promise<Map<number, { rank: string; name: string }>> {
  const map = new Map<number, { rank: string; name: string }>();
  for (let i = 0; i < allIds.length; i += 30) {
    const chunk = allIds.slice(i, i + 30);
    if (!chunk.length) continue;
    if (i > 0) await sleep(ANCESTRY_SLEEP_MS);
    try {
      const data = await inatGet<{ results: any[] }>(`/taxa/${chunk.join(',')}?per_page=30`);
      for (const t of data.results ?? []) {
        if (t?.id == null) continue;
        map.set(Number(t.id), {
          rank: String(t.rank ?? ''),
          name: t.preferred_common_name || t.name || '',
        });
      }
    } catch (err) {
      console.warn(`  ancestry chunk failed: ${(err as Error).message}`);
    }
  }
  return map;
}

function applyAncestry(rows: SeedRow[], taxaMap: Map<number, { rank: string; name: string }>): void {
  for (const row of rows) {
    const byRank = new Map<string, { rank: string; name: string }>();
    for (const aid of row.ancestorIds) {
      const entry = taxaMap.get(aid);
      if (entry && (ANCESTRY_RANKS as readonly string[]).includes(entry.rank)) {
        byRank.set(entry.rank, entry);
      }
    }
    row.ancestry = ANCESTRY_RANKS
      .map((r) => byRank.get(r))
      .filter((e): e is { rank: string; name: string } => !!e);
  }
}

function sqlString(s: string | null): string {
  return s == null ? 'NULL' : `'${s.replace(/'/g, "''")}'`;
}

function generateObservationsSQL(rows: SeedRow[]): string {
  const now = Math.floor(Date.now() / 1000);
  const stmts = rows.map((r) => {
    const photoUrls = JSON.stringify(r.photoUrls);
    const ancestry = JSON.stringify(r.ancestry);
    return `INSERT OR REPLACE INTO observations (
      id, taxon_id, taxon_name, lat, lng, photo_urls, observer_login,
      license, observation_url, ancestry, category_id, continent, fetched_at
    ) VALUES (
      ${r.id}, ${r.taxonId}, ${sqlString(r.taxonName)}, ${r.lat}, ${r.lng},
      ${sqlString(photoUrls)}, ${sqlString(r.observerLogin)}, ${sqlString(r.license)},
      ${sqlString(r.observationUrl)}, ${sqlString(ancestry)},
      ${r.categoryId}, ${sqlString(r.continent)}, ${now}
    );`;
  });
  return stmts.join('\n');
}

function generateTaxonStubsSQL(taxa: TaxonStub[]): string {
  const now = Math.floor(Date.now() / 1000);
  const stmts = taxa.map((t) =>
    `INSERT OR IGNORE INTO taxon_enrichment (
      taxon_id, taxon_name, enriched_at, sources_attempted, schema_version
    ) VALUES (${t.taxonId}, ${sqlString(t.taxonName)}, ${now}, '[]', 1);`
  );
  return stmts.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  let speciesPerBucket = 10;
  let obsPerSpecies = 5;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--species' && args[i + 1]) speciesPerBucket = parseInt(args[i + 1], 10);
    if (args[i] === '--obs' && args[i + 1]) obsPerSpecies = parseInt(args[i + 1], 10);
  }

  console.log(`\nSeeding observations: ${speciesPerBucket} species × ${obsPerSpecies} obs per (category × continent) bucket`);
  console.log(`Total buckets: ${CATEGORIES.length * CONTINENTS.length}\n`);

  const allRows: SeedRow[] = [];
  const taxaSeen = new Map<number, string>();

  for (const cat of CATEGORIES) {
    for (const cont of CONTINENTS) {
      const tag = `[${cat.label} × ${cont.label}]`;
      try {
        console.log(`${tag} fetching top ${speciesPerBucket} species...`);
        const species = await topSpecies(cat.taxonId, cont.placeId, speciesPerBucket);
        await sleep(SLEEP_MS);

        for (const sp of species) {
          taxaSeen.set(sp.id, sp.name);
          try {
            const rows = await fetchObservations(sp.id, cont.placeId, obsPerSpecies, cat.taxonId, cont.code);
            for (const row of rows) {
              if (row.taxonId && !taxaSeen.has(row.taxonId)) {
                taxaSeen.set(row.taxonId, row.taxonName);
              }
            }
            allRows.push(...rows);
            console.log(`  ${sp.name}: +${rows.length} obs`);
          } catch (err) {
            console.warn(`  ${sp.name}: FAILED ${(err as Error).message}`);
          }
          await sleep(SLEEP_MS);
        }
      } catch (err) {
        console.warn(`${tag} bucket FAILED: ${(err as Error).message}`);
      }
    }
  }

  console.log(`\nFetched ${allRows.length} observations across ${taxaSeen.size} unique taxa`);
  console.log(`Resolving ancestry for ${[...new Set(allRows.flatMap((r) => r.ancestorIds))].length} ancestor IDs...`);

  const allAncestorIds = [...new Set(allRows.flatMap((r) => r.ancestorIds))];
  const taxaMap = await fetchAncestry(allAncestorIds);
  applyAncestry(allRows, taxaMap);

  const ts = Date.now();
  const obsPath = `scripts/observations-${ts}.sql`;
  const stubPath = `scripts/observations-taxa-${ts}.sql`;

  const taxa: TaxonStub[] = [...taxaSeen.entries()].map(([taxonId, taxonName]) => ({ taxonId, taxonName }));

  await writeFile(obsPath, generateObservationsSQL(allRows));
  await writeFile(stubPath, generateTaxonStubsSQL(taxa));

  console.log(`\nWrote:`);
  console.log(`  ${obsPath}      (${allRows.length} observations)`);
  console.log(`  ${stubPath} (${taxa.length} taxon stubs)`);
  console.log(`\nApply with:`);
  console.log(`  npx wrangler d1 execute lifeguesser-db --local  --file=${stubPath}`);
  console.log(`  npx wrangler d1 execute lifeguesser-db --local  --file=${obsPath}`);
  console.log(`  npx wrangler d1 execute lifeguesser-db --remote --file=${stubPath}`);
  console.log(`  npx wrangler d1 execute lifeguesser-db --remote --file=${obsPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
