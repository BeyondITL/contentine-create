/**
 * Compact count formatting with K/M suffixes (e.g. download counts).
 *
 * Units are picked AFTER rounding to one decimal, so a value that rounds
 * up to the next unit moves to that unit: 999_950 renders "1.0M", never
 * "1000.0K".
 */
export function formatCount(count: number): string {
  if (count >= 1_000_000 || (count >= 1_000 && Math.round(count / 100) >= 10_000)) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}
