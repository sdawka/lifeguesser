export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function scoreFromDistance(km: number): number {
  return Math.round(5000 * Math.exp(-km / 2000));
}

export const HINT_MULTIPLIERS = [1, 0.8, 0.6, 0.4, 0.2] as const;
export function applyHintMultiplier(score: number, hintsUsed: number): number {
  const i = Math.max(0, Math.min(4, Math.floor(hintsUsed)));
  return Math.round(score * HINT_MULTIPLIERS[i]);
}

export function thresholdForRound(roundIndex: number): number {
  const steps = Math.floor(roundIndex / 3);
  return Math.max(250, 2000 - steps * 100);
}
