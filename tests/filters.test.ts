import { describe, it, expect } from 'vitest';
import { hashFiltersSync } from '../src/lib/filters';

describe('hashFiltersSync', () => {
  it('is stable for same input', () => {
    const a = hashFiltersSync({ taxonId: 3, placeId: 97394 });
    const b = hashFiltersSync({ taxonId: 3, placeId: 97394 });
    expect(a).toBe(b);
  });
  it('differs for different input', () => {
    const a = hashFiltersSync({ taxonId: 3 });
    const b = hashFiltersSync({ taxonId: 4 });
    expect(a).not.toBe(b);
  });
  it('returns 12 hex chars', () => {
    const a = hashFiltersSync({});
    expect(a).toMatch(/^[0-9a-f]{12}$/);
  });
});
