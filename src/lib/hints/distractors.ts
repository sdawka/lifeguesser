import type { IucnStatus } from '../enrichment/types';

function shuffle<T>(arr: T[]): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Pick `count` random items from `pool` that are not equal to `correct`.
 * Throws if the pool has fewer than `count + 1` elements (not enough
 * distinct values to produce the requested number of distractors).
 */
export function pickDistractors<T>(
  correct: T,
  pool: readonly T[],
  count: number,
): T[] {
  const candidates = pool.filter((x) => x !== correct);
  if (candidates.length < count) {
    throw new Error(
      `pickDistractors: pool has ${pool.length} items, need at least ${count + 1} to exclude correct value`,
    );
  }
  return shuffle(candidates).slice(0, count);
}

/**
 * Pick `count` random items from `pool` that are not in `correctSet`.
 * For multi-valued fields (habitats, continents) where any stored value
 * could be the "correct" answer and distractors must lie entirely outside
 * the stored set.
 */
export function pickMultiValueDistractors<T>(
  correctSet: readonly T[],
  pool: readonly T[],
  count: number,
): T[] {
  const set = new Set(correctSet);
  const candidates = pool.filter((x) => !set.has(x));
  if (candidates.length < count) {
    throw new Error(
      `pickMultiValueDistractors: only ${candidates.length} items outside correctSet, need ${count}`,
    );
  }
  return shuffle(candidates).slice(0, count);
}

// Ordered IUCN scale (DD intentionally excluded — see pickAdjacentIucn).
const IUCN_SCALE: readonly IucnStatus[] = [
  'LC',
  'NT',
  'VU',
  'EN',
  'CR',
  'EW',
  'EX',
];

/**
 * Return `count` distractors "close" to the correct IUCN status on the
 * threat scale for pedagogical interest. Prefers neighbours at distance
 * 1, then 2, and so on. When `correct` is `DD`, falls back to a random
 * selection from the scale.
 */
export function pickAdjacentIucn(
  correct: IucnStatus,
  count: number,
): IucnStatus[] {
  if (correct === 'DD') {
    const shuffled = shuffle(IUCN_SCALE.slice());
    return shuffled.slice(0, count);
  }

  const i = IUCN_SCALE.indexOf(correct);
  if (i === -1) {
    // Defensive: unknown status — fall back to random.
    const shuffled = shuffle(IUCN_SCALE.slice());
    return shuffled.slice(0, count);
  }

  const out: IucnStatus[] = [];
  for (let d = 1; d < IUCN_SCALE.length && out.length < count; d++) {
    const left = i - d;
    const right = i + d;
    if (left >= 0) {
      out.push(IUCN_SCALE[left]);
      if (out.length >= count) break;
    }
    if (right < IUCN_SCALE.length) {
      out.push(IUCN_SCALE[right]);
    }
  }
  return out.slice(0, count);
}
