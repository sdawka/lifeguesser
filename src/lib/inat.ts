import type { Filters, Observation } from '../types';
import { cachedFetch } from './cached-fetch';

const ANCESTRY_RANKS = ['kingdom', 'class', 'order', 'family'] as const;

const INAT_HEADERS = {
  'User-Agent': 'lifeguesser/0.1 (github.com/example/lifeguesser)',
  Accept: 'application/json',
};

export async function inatFetch(url: string): Promise<Response> {
  return cachedFetch(url, { headers: INAT_HEADERS });
}

export async function fetchObservationPool(filters: Filters): Promise<Observation[]> {
  const params = new URLSearchParams({
    quality_grade: 'research',
    photos: 'true',
    geoprivacy: 'open',
    per_page: '200',
    order_by: 'random',
  });
  if (filters.taxonId != null) params.set('taxon_id', String(filters.taxonId));
  if (filters.placeId != null) params.set('place_id', String(filters.placeId));

  const url = `https://api.inaturalist.org/v1/observations?${params.toString()}`;
  const res = await inatFetch(url);
  if (!res.ok) throw new Error(`iNat request failed: ${res.status}`);
  const json = (await res.json()) as { results: any[] };
  const results = Array.isArray(json.results) ? json.results : [];

  type Prelim = Omit<Observation, 'ancestry'> & { ancestorIds: number[] };
  const prelim: Prelim[] = [];
  for (const r of results) {
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
    const taxonId: number | undefined = Number.isFinite(r?.taxon?.id)
      ? Number(r.taxon.id)
      : undefined;
    const ancestorIds: number[] = Array.isArray(r?.taxon?.ancestor_ids)
      ? r.taxon.ancestor_ids.filter((n: any) => Number.isFinite(n))
      : [];
    prelim.push({
      id: Number(r.id),
      lat,
      lng,
      photoUrls,
      taxonId,
      taxonName,
      observerLogin: r?.user?.login ?? 'unknown',
      license: r?.license_code ?? null,
      observationUrl: r?.uri ?? `https://www.inaturalist.org/observations/${r?.id}`,
      ancestorIds,
    });
  }

  const allIds = Array.from(new Set(prelim.flatMap((p) => p.ancestorIds)));
  const taxaMap = new Map<number, { rank: string; name: string }>();
  // iNat `/observations` returns `ancestor_ids` but not ancestor names/ranks,
  // and there is no documented `include` parameter that inlines them. We keep
  // the batch `/taxa` loop but throttle between chunks (250ms) to stay under
  // iNat's burst limit. The CF Cache API memoizes chunks across cold fetches.
  try {
    for (let i = 0; i < allIds.length; i += 30) {
      const chunk = allIds.slice(i, i + 30);
      if (!chunk.length) continue;
      if (i > 0) {
        await new Promise((r) => setTimeout(r, 250));
      }
      const turl = `https://api.inaturalist.org/v1/taxa/${chunk.join(',')}?per_page=30`;
      const tres = await inatFetch(turl);
      if (!tres.ok) throw new Error(`iNat taxa request failed: ${tres.status}`);
      const tjson = (await tres.json()) as { results: any[] };
      for (const t of tjson.results ?? []) {
        if (t?.id == null) continue;
        taxaMap.set(Number(t.id), {
          rank: String(t.rank ?? ''),
          name: t.preferred_common_name || t.name || '',
        });
      }
    }
  } catch (err) {
    console.error('iNat taxa batch fetch failed', err);
    taxaMap.clear();
  }

  const out: Observation[] = prelim.map((p) => {
    const byRank = new Map<string, { rank: string; name: string }>();
    for (const aid of p.ancestorIds) {
      const entry = taxaMap.get(aid);
      if (entry && (ANCESTRY_RANKS as readonly string[]).includes(entry.rank)) {
        byRank.set(entry.rank, entry);
      }
    }
    const ancestry = ANCESTRY_RANKS
      .map((r) => byRank.get(r))
      .filter((e): e is { rank: string; name: string } => !!e);
    const { ancestorIds, ...rest } = p;
    return { ...rest, ancestry };
  });

  return out;
}
