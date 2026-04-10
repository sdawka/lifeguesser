export function getBestStreak(filterHash: string): number {
  if (typeof window === 'undefined') return 0;
  try {
    const v = window.localStorage.getItem(`lifeguesser:best:${filterHash}`);
    const n = v ? Number(v) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function setBestStreak(filterHash: string, streak: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`lifeguesser:best:${filterHash}`, String(streak));
  } catch {
    // ignore
  }
}

export type GameRoundRecord = {
  distanceKm: number;
  score: number;
  hintsUsed: number;
  passed: boolean;
  taxonName: string;
};

export type GameRecord = {
  at: number;
  filterHash: string;
  filterLabel: string;
  finalStreak: number;
  rounds: GameRoundRecord[];
};

const HISTORY_KEY = 'lifeguesser:history';
const MAX_HISTORY = 100;

export function getGameHistory(): GameRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as GameRecord[]) : [];
  } catch {
    return [];
  }
}

export function appendGameRecord(rec: GameRecord): void {
  if (typeof window === 'undefined') return;
  if (!rec || !Array.isArray(rec.rounds) || rec.rounds.length < 1) return;
  try {
    const current = getGameHistory();
    const next = [rec, ...current].slice(0, MAX_HISTORY);
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export function clearGameHistory(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(HISTORY_KEY);
  } catch {
    // ignore
  }
}
