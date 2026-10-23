/**
 * Money helpers. TZS is stored as whole integers; decimals are rejected, never rounded.
 */

export function isWholeTzs(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** Parses user input such as "2,000,000", "TZS 186,167" or "16764630". Returns null if invalid. */
export function parseTzs(input: string | number): number | null {
  if (typeof input === "number") {
    return isWholeTzs(input) ? input : null;
  }
  const cleaned = input.replace(/tzs|tsh|\/=|\s|,/gi, "").trim();
  if (cleaned === "" || cleaned === "-") return 0;
  if (!/^\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isSafeInteger(value) ? value : null;
}

const groupFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** 1234567 -> "1,234,567" */
export function formatAmount(amount: number): string {
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError(`Amount must be a whole number of TZS, got ${amount}`);
  }
  return groupFormatter.format(amount);
}

/** 1234567 -> "TZS 1,234,567" */
export function formatTzs(amount: number): string {
  return `TZS ${formatAmount(amount)}`;
}

/** Sums integer amounts, throwing if any value is not a safe whole number. */
export function sumTzs(amounts: readonly number[]): number {
  let total = 0;
  for (const amount of amounts) {
    if (!Number.isSafeInteger(amount)) {
      throw new RangeError(`Amount must be a whole number of TZS, got ${amount}`);
    }
    total += amount;
    if (!Number.isSafeInteger(total)) {
      throw new RangeError("Total exceeds the safe integer range");
    }
  }
  return total;
}
