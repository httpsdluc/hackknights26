// Integer money helpers. All amounts are whole USD; haircuts are converted to integer
// basis points so no total is ever computed in floating point.

const BPS = 10_000;

/** Throws unless `n` is a whole, non-negative, safe-integer dollar amount. */
export function wholeUsd(n: unknown, what: string): number {
  if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 0) {
    throw new Error(`${what} must be a whole non-negative USD amount, got ${String(n)}`);
  }
  return n;
}

/** Fraction (0.15) → integer basis points (1500). Throws if finer than 1 bp or outside [0, 1]. */
export function toBps(fraction: number, what: string): number {
  const bps = Math.round(fraction * BPS);
  if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1 || Math.abs(bps - fraction * BPS) > 1e-6) {
    throw new Error(`${what} must be a fraction in [0, 1] with at most 4 decimals, got ${fraction}`);
  }
  return bps;
}

/** ceil(a / b) for non-negative safe integers a and positive b. */
export function ceilDiv(a: number, b: number): number {
  return Math.floor((a + b - 1) / b);
}

/** Σ value × bps / 10 000, rounded up to the whole dollar. Every intermediate is an integer. */
export function sumHaircutUsd(items: { value: number; bps: number }[]): number {
  let numerator = 0;
  for (const { value, bps } of items) {
    numerator += value * bps;
    if (!Number.isSafeInteger(numerator)) throw new Error("haircut total exceeds safe integer range");
  }
  return ceilDiv(numerator, BPS);
}
