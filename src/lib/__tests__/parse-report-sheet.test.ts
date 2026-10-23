import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parseReportSheet } from "@/lib/import/parse-report-sheet";
import { reconcileTotals } from "@/lib/domain/aggregation";

describe("parseReportSheet", () => {
  it("reads one-based Excel columns and reconciles the sample report totals", () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("August 2026");
    sheet.addRows([
      ["No", "INVESTOR NAME", "UNITS", "STOCK MARKET"],
      [1, "Sample Investor", 106077627, 31397777],
      ["TOTAL", "", 106077627, 31397777],
      ["FINAL TOTAL", "", "", 137475404],
    ]);

    const parsed = parseReportSheet(workbook);

    expect(parsed.rows).toEqual([{ name: "Sample Investor", units: 106077627, stock: 31397777 }]);
    expect(parsed.expected).toEqual({
      units: 106077627,
      stock: 31397777,
      final: 137475404,
    });
    expect(reconcileTotals(parsed.rows, parsed.expected).matches).toBe(true);
  });
});
