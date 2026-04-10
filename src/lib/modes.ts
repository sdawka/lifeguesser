import type { GameMode } from '../types';
import { thresholdForRound } from './scoring';

export const ENDLESS_MODE = {
  shouldContinue(distanceKm: number, roundIndex: number): boolean {
    return distanceKm <= thresholdForRound(roundIndex);
  },
};

export const MODES: Record<
  GameMode,
  { shouldContinue: (km: number, i: number) => boolean }
> = {
  endless: ENDLESS_MODE,
};
