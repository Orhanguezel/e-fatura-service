/** API-CONTRACT / WORK-PLAN D7: 1m, 5m, 30m, 2h, 6h (5 retry) */
export const RELIABILITY_BACKOFF_MS = [
  60_000,
  300_000,
  1_800_000,
  7_200_000,
  21_600_000
] as const;

export const RELIABILITY_MAX_ATTEMPTS = 6;

export function reliabilityBackoffStrategy(attemptsMade: number): number {
  const index = Math.max(0, attemptsMade - 1);
  return RELIABILITY_BACKOFF_MS[index] ?? RELIABILITY_BACKOFF_MS.at(-1)!;
}
