import { describe, expect, it } from "vitest";
import { aggregateTransactions, reconcileTotals } from "@/lib/domain/aggregation";

describe("aggregateTransactions", () => {
  it("sums verified entries by investor and type, in first-entry order", () => {
    const { investors, totals } = aggregateTransactions([
      {
        investorId: "a",
        investorName: "A",
        type: "UNITS",
        amount: 2000000,
        date: "2026-08-03",
        status: "verified",
      },
      {
        investorId: "b",
        investorName: "B",
        type: "STOCK_MARKET",
        amount: 186167,
        date: "2026-08-01",
        status: "verified",
      },
      {
        investorId: "a",
        investorName: "A",
        type: "STOCK_MARKET",
        amount: 100000,
        date: "2026-08-04",
        status: "pending",
      },
    ]);

    expect(investors.map(({ investorId }) => investorId)).toEqual(["b", "a"]);
    expect(investors[1]).toMatchObject({ units: 2000000, stock: 0, total: 2000000 });
    expect(totals).toEqual({ units: 2000000, stock: 186167, final: 2186167, participants: 2 });
  });

  it("includes pending only when requested", () => {
    const input = [
      {
        investorId: "a",
        investorName: "A",
        type: "UNITS" as const,
        amount: 1,
        date: "2026-08-01",
        status: "pending" as const,
      },
    ];
    expect(aggregateTransactions(input).totals.final).toBe(0);
    expect(aggregateTransactions(input, true).totals.final).toBe(1);
  });

  it("rejects totals outside the safe integer range", () => {
    expect(() =>
      aggregateTransactions([
        { investorId: "a", investorName: "A", type: "UNITS", amount: Number.MAX_SAFE_INTEGER, date: "2026-08-01", status: "verified" },
        { investorId: "b", investorName: "B", type: "STOCK_MARKET", amount: 1, date: "2026-08-01", status: "verified" },
      ]),
    ).toThrow(RangeError);
  });
});

describe("reconcileTotals", () => {
  it("matches the sample report totals exactly", () => {
    expect(
      reconcileTotals(
        [{ units: 106077627, stock: 31397777 }],
        { units: 106077627, stock: 31397777, final: 137475404 },
      ).matches,
    ).toBe(true);
  });

  it("rejects mismatched report totals", () => {
    expect(
      reconcileTotals([{ units: 106077626, stock: 31397777 }], {
        units: 106077627,
        stock: 31397777,
        final: 137475404,
      }).matches,
    ).toBe(false);
  });
});
