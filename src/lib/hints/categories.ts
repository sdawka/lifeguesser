import type { TaxonEnrichment } from '../enrichment/types';

export type HintCategory =
  | 'diet'
  | 'habitat'
  | 'continent'
  | 'conservation'
  | 'taxonomy-class'
  | 'taxonomy-order';

/**
 * Returns the subset of HintCategory for which the enrichment record has
 * usable data. Taxonomy categories are always included because they're
 * served from iNat ancestry (not the enrichment record) and are therefore
 * always available to the handler.
 */
export function categoriesWithData(e: TaxonEnrichment): HintCategory[] {
  const out: HintCategory[] = [];

  if (e.diet?.value) {
    out.push('diet');
  }
  if (e.habitats?.value && e.habitats.value.length > 0) {
    out.push('habitat');
  }
  if (e.continents?.value && e.continents.value.length > 0) {
    out.push('continent');
  }
  if (e.iucnStatus?.value) {
    out.push('conservation');
  }

  // Taxonomy categories are always available (ancestry comes from iNat,
  // not the enrichment record).
  out.push('taxonomy-class');
  out.push('taxonomy-order');

  return out;
}

/**
 * Fisher-Yates shuffle; returns the first `n` elements. If `available`
 * has fewer than or equal to `n` elements, returns a shuffled copy of all.
 */
export function pickRandomCategories(
  available: HintCategory[],
  n: number,
): HintCategory[] {
  const copy = available.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  if (copy.length <= n) return copy;
  return copy.slice(0, n);
}
