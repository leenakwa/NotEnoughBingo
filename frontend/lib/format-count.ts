const compactCounts = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Counts are whole, nonnegative values; invalid API values should not surface as NaN. */
export function formatCount(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    return "—";
  }
  if (value < 0) return "—";
  return compactCounts.format(value);
}
