import type { Filters } from '../types';

function buildKey(f: Filters): string {
  return `t=${f.taxonId ?? ''}|p=${f.placeId ?? ''}`;
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

export const TAXON_PRESETS: { label: string; taxonId?: number }[] = [
  { label: 'Any' },
  { label: 'Birds', taxonId: 3 },
  { label: 'Mammals', taxonId: 40151 },
  { label: 'Reptiles', taxonId: 26036 },
  { label: 'Amphibians', taxonId: 20978 },
  { label: 'Fishes', taxonId: 47178 },
  { label: 'Insects', taxonId: 47158 },
  { label: 'Plants', taxonId: 47126 },
  { label: 'Fungi', taxonId: 47170 },
];

export const PLACE_PRESETS: { label: string; placeId?: number }[] = [
  { label: 'World' },
  { label: 'North America', placeId: 97394 },
  { label: 'South America', placeId: 97389 },
  { label: 'Europe', placeId: 97391 },
  { label: 'Africa', placeId: 97392 },
  { label: 'Asia', placeId: 97395 },
  { label: 'Oceania', placeId: 97393 },
];
