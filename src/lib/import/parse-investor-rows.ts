import type ExcelJS from "exceljs";

export interface ImportedInvestorRow {
  name: string;
  phone: string;
  notes: string;
  status: "active";
}

export function excelCellText(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if ("richText" in value)
    return value.richText
      .map((part) => part.text ?? "")
      .join("")
      .trim();
  if ("text" in value && typeof value.text === "string") return value.text.trim();
  if ("result" in value)
    return value.result === null || value.result === undefined ? "" : String(value.result).trim();
  return "";
}

function normalizeHeading(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_\s-]+/g, "")
    .replace(/[^a-z]/g, "");
}

export function parseInvestorRows(rows: string[][]): ImportedInvestorRow[] {
  const headerIndex = rows.findIndex((row) =>
    row.some((cell) =>
      ["name", "fullname", "investorname", "investorsname", "membername"].includes(
        normalizeHeading(cell),
      ),
    ),
  );
  if (headerIndex < 0) throw new Error("csvNameColumn");

  const headings = rows[headerIndex].map(normalizeHeading);
  const nameIndex = headings.findIndex((heading) =>
    ["name", "fullname", "investorname", "investorsname", "membername"].includes(heading),
  );
  const phoneIndex = headings.findIndex((heading) =>
    ["phone", "phonenumber", "mobile"].includes(heading),
  );
  const notesIndex = headings.findIndex((heading) => heading === "notes");

  return rows
    .slice(headerIndex + 1)
    .map((row) => ({
      name: row[nameIndex]?.trim() ?? "",
      phone: phoneIndex >= 0 ? (row[phoneIndex]?.trim() ?? "") : "",
      notes: notesIndex >= 0 ? (row[notesIndex]?.trim() ?? "") : "",
      status: "active" as const,
    }))
    .filter(
      (row) =>
        row.name && !["total", "final total", "grand total"].includes(row.name.toLowerCase()),
    );
}
