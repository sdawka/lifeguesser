import { describe, it, expect } from 'vitest';
import type { LeaderboardType, LeaderboardWindow } from '../src/lib/leaderboard-types';

describe('leaderboard types', () => {
  it('LeaderboardType accepts valid values', () => {
    const types: LeaderboardType[] = ['streak', 'totalScore'];
    expect(types).toHaveLength(2);
  });

  it('LeaderboardWindow accepts valid values', () => {
    const windows: LeaderboardWindow[] = ['allTime', 'daily'];
    expect(windows).toHaveLength(2);
  });
});
