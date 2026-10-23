import type ExcelJS from "exceljs";
import { parseTzs } from "@/lib/money";
import { excelCellText } from "@/lib/import/parse-investor-rows";

export interface ImportRow {
  name: string;
  investorId?: string;
  units: number;
  stock: number;
}

export interface ParsedSheet {
  rows: ImportRow[];
  expected: { units: number; stock: number; final: number };
}

function cellText(cell: ExcelJS.Cell): string {
  return excelCellText(cell);
}

function normalizeHeading(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_\s-]+/g, "")
    .replace(/[^a-z]/g, "");
}

/** Read the original challenge report's investor rows and TOTAL / FINAL TOTAL rows. */
export function parseReportSheet(workbook: ExcelJS.Workbook): ParsedSheet {
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("The workbook does not contain a worksheet.");
  let headerRow = 0;
  let nameColumn = 0;
  let unitsColumn = 0;
  let stockColumn = 0;
  const totals: { expected: ParsedSheet["expected"] | null; final: number | null } = {
    expected: null,
    final: null,
  };
  const rows: ImportRow[] = [];

  sheet.eachRow((row, rowNumber) => {
    const labels = Array.from({ length: Math.max(row.cellCount, sheet.columnCount) }, (_, index) =>
      normalizeHeading(cellText(row.getCell(index + 1))),
    );
    const nameIndex = labels.findIndex((value) =>
      ["investorname", "investorsname", "name", "investor"].includes(value),
    );
    const unitsIndex = labels.findIndex((value) => ["units", "unitstrust"].includes(value));
    const stockIndex = labels.findIndex((value) =>
      ["stockmarket", "stocks", "shares"].includes(value),
    );
    if (nameIndex >= 0 && unitsIndex >= 0 && stockIndex >= 0) {
      headerRow = rowNumber;
      nameColumn = nameIndex + 1;
      unitsColumn = unitsIndex + 1;
      stockColumn = stockIndex + 1;
      return;
    }
    if (!headerRow || rowNumber <= headerRow) return;

    const first = normalizeHeading(cellText(row.getCell(nameColumn)));
    if (first.startsWith("finaltotal")) {
      for (let index = row.cellCount; index >= 1; index -= 1) {
        const value = parseTzs(cellText(row.getCell(index)));
        if (value !== null && value > 0) {
          totals.final = value;
          break;
        }
      }
      return;
    }
    if (first === "total" || first === "grandtotal") {
      const units = parseTzs(cellText(row.getCell(unitsColumn)));
      const stock = parseTzs(cellText(row.getCell(stockColumn)));
      if (units === null || stock === null) {
        throw new Error("The TOTAL row must contain valid Units and Stock Market values.");
      }
      totals.expected = { units, stock, final: units + stock };
      return;
    }
    const name = cellText(row.getCell(nameColumn));
    if (!name) return;
    const units = parseTzs(cellText(row.getCell(unitsColumn)));
    const stock = parseTzs(cellText(row.getCell(stockColumn)));
    if (units === null || stock === null) {
      throw new Error(`Invalid amount for ${name}. Use whole TZS numbers.`);
    }
    rows.push({ name, units, stock });
  });

  if (!headerRow)
    throw new Error("Could not find columns for Investor Name, Units, and Stock Market.");
  if (!rows.length) throw new Error("No investor rows found below the header.");
  if (!totals.expected)
    throw new Error("Could not find the TOTAL row with Units and Stock Market totals.");
  if (totals.final === null) throw new Error("Could not find a FINAL TOTAL row in the workbook.");
  return { rows, expected: { ...totals.expected, final: totals.final } };
}
