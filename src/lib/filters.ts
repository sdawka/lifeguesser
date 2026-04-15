import type { Filters } from '../types';

function buildKey(f: Filters): string {
  const taxa = (f.taxonIds ?? []).sort((a, b) => a - b).join(',');
  const places = (f.placeIds ?? []).sort((a, b) => a - b).join(',');
  return `t=${taxa}|p=${places}`;
}

export async function hashFilters(f: Filters): Promise<string> {
  const key = buildKey(f);
  const data = new TextEncoder().encode(key);
  const buf = await crypto.subtle.digest('SHA-1', data);
  const hex = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hex.slice(0, 12);
}

export function hashFiltersSync(f: Filters): string {
  const key = buildKey(f);
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const h1 = (h >>> 0).toString(16).padStart(8, '0');
  // second pass with different seed to get more hex chars
  let h2 = 0x9e3779b1;
  for (let i = 0; i < key.length; i++) {
    h2 ^= key.charCodeAt(i);
    h2 = Math.imul(h2, 0x85ebca77);
  }
  const h2s = (h2 >>> 0).toString(16).padStart(8, '0');
  return (h1 + h2s).slice(0, 12);
}

export const TAXON_PRESETS: { label: string; taxonIds?: number[] }[] = [
  { label: 'Any' },
  { label: 'Birds', taxonIds: [3] },
  { label: 'Mammals', taxonIds: [40151] },
  { label: 'Reptiles', taxonIds: [26036] },
  { label: 'Amphibians', taxonIds: [20978] },
  { label: 'Fishes', taxonIds: [47178] },
  { label: 'Insects', taxonIds: [47158] },
  { label: 'Plants', taxonIds: [47126] },
  { label: 'Fungi', taxonIds: [47170] },
];

export const PLACE_PRESETS: { label: string; placeIds?: number[] }[] = [
  { label: 'World' },
  { label: 'North America', placeIds: [97394] },
  { label: 'South America', placeIds: [97389] },
  { label: 'Europe', placeIds: [97391] },
  { label: 'Africa', placeIds: [97392] },
  { label: 'Asia', placeIds: [97395] },
  { label: 'Oceania', placeIds: [97393] },
];
