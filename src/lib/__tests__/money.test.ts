import { describe, expect, it } from "vitest";
import { formatAmount, formatTzs, isWholeTzs, parseTzs, sumTzs } from "@/lib/money";

describe("formatTzs", () => {
  it("formats with thousands separators", () => {
    expect(formatTzs(1234567)).toBe("TZS 1,234,567");
    expect(formatTzs(0)).toBe("TZS 0");
    expect(formatAmount(137475404)).toBe("137,475,404");
  });

  it("rejects non-integers instead of rounding", () => {
    expect(() => formatTzs(10.5)).toThrow(RangeError);
    expect(() => formatTzs(Number.NaN)).toThrow(RangeError);
  });
});

describe("parseTzs", () => {
  it("parses common admin inputs", () => {
    expect(parseTzs("2,000,000")).toBe(2000000);
    expect(parseTzs("TZS 186,167")).toBe(186167);
    expect(parseTzs("16764630")).toBe(16764630);
    expect(parseTzs("Tsh 50,000/=")).toBe(50000);
    expect(parseTzs("")).toBe(0);
    expect(parseTzs(42)).toBe(42);
  });

  it("returns null for decimals or garbage", () => {
    expect(parseTzs("100.50")).toBeNull();
    expect(parseTzs("abc")).toBeNull();
    expect(parseTzs(-5)).toBeNull();
    expect(parseTzs(1.5)).toBeNull();
  });
});

describe("sumTzs", () => {
  it("sums integer amounts exactly", () => {
    expect(sumTzs([106077627, 31397777])).toBe(137475404);
    expect(sumTzs([])).toBe(0);
  });

  it("throws on non-integers", () => {
    expect(() => sumTzs([1, 0.1])).toThrow(RangeError);
  });

  it("validates whole TZS", () => {
    expect(isWholeTzs(0)).toBe(true);
    expect(isWholeTzs(-1)).toBe(false);
    expect(isWholeTzs(1.2)).toBe(false);
  });
});
