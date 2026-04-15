import { describe, it, expect } from 'vitest';
import { hashFiltersSync } from '../src/lib/filters';

describe('hashFiltersSync', () => {
  it('is stable for same input', () => {
    const a = hashFiltersSync({ taxonIds: [3], placeIds: [97394] });
    const b = hashFiltersSync({ taxonIds: [3], placeIds: [97394] });
    expect(a).toBe(b);
  });
  it('differs for different input', () => {
    const a = hashFiltersSync({ taxonIds: [3] });
    const b = hashFiltersSync({ taxonIds: [4] });
    expect(a).not.toBe(b);
  });
  it('returns 12 hex chars', () => {
    const a = hashFiltersSync({});
    expect(a).toMatch(/^[0-9a-f]{12}$/);
  });
  it('is stable regardless of array order', () => {
    const a = hashFiltersSync({ taxonIds: [3, 4, 5], placeIds: [1, 2] });
    const b = hashFiltersSync({ taxonIds: [5, 3, 4], placeIds: [2, 1] });
    expect(a).toBe(b);
  });
  it('handles multiple IDs', () => {
    const a = hashFiltersSync({ taxonIds: [3, 40151], placeIds: [97394, 97391] });
    const b = hashFiltersSync({ taxonIds: [3] });
    expect(a).not.toBe(b);
  });
});
