// The only place money and percentages are formatted. Pair with the `tabular-nums` class.

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const percent = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 2,
});

/** Whole US dollars: 1900000 → "$1,900,000" */
export function formatUsd(amount: number): string {
  return usd.format(amount);
}

/** Haircut fraction: 0.15 → "15%" */
export function formatPercent(fraction: number): string {
  return percent.format(fraction);
}
