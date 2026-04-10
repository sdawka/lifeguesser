import { describe, it, expect } from 'vitest';
import { haversineKm, scoreFromDistance, thresholdForRound, applyHintMultiplier } from '../src/lib/scoring';

describe('haversineKm', () => {
  it('returns 0 for identical points', () => {
    expect(haversineKm({ lat: 10, lng: 20 }, { lat: 10, lng: 20 })).toBe(0);
  });
  it('NYC to London is ~5570 km', () => {
    const d = haversineKm({ lat: 40.7128, lng: -74.006 }, { lat: 51.5074, lng: -0.1278 });
    expect(d).toBeGreaterThan(5540);
    expect(d).toBeLessThan(5600);
  });
});

describe('scoreFromDistance', () => {
  it('is 5000 at 0 km', () => {
    expect(scoreFromDistance(0)).toBe(5000);
  });
  it('is ~1839 at 2000 km', () => {
    expect(scoreFromDistance(2000)).toBe(Math.round(5000 * Math.exp(-1)));
    expect(Math.abs(scoreFromDistance(2000) - 1839)).toBeLessThanOrEqual(1);
  });
});

describe('thresholdForRound', () => {
  it('round 0 is 2000', () => {
    expect(thresholdForRound(0)).toBe(2000);
  });
  it('round 3 is 1900', () => {
    expect(thresholdForRound(3)).toBe(1900);
  });
  it('clamps to 250 at high rounds', () => {
    expect(thresholdForRound(100)).toBe(250);
  });
});

describe('applyHintMultiplier', () => {
  it('0 hints keeps score', () => {
    expect(applyHintMultiplier(5000, 0)).toBe(5000);
  });
  it('1 hint -> 0.8', () => {
    expect(applyHintMultiplier(5000, 1)).toBe(4000);
  });
  it('2 hints -> 0.6', () => {
    expect(applyHintMultiplier(5000, 2)).toBe(3000);
  });
  it('3 hints -> 0.4', () => {
    expect(applyHintMultiplier(5000, 3)).toBe(2000);
  });
  it('4 hints -> 0.2', () => {
    expect(applyHintMultiplier(5000, 4)).toBe(1000);
  });
  it('clamps high values', () => {
    expect(applyHintMultiplier(5000, 99)).toBe(1000);
  });
  it('clamps negative values', () => {
    expect(applyHintMultiplier(5000, -1)).toBe(5000);
  });
});
