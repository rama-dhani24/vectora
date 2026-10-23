import ExcelJS from "exceljs";
import { createElement } from "react";
import { Document, renderToBuffer } from "@react-pdf/renderer";
import { z } from "zod";
import { assertRole } from "@/lib/auth/dal";
import { aggregateTransactions } from "@/lib/domain/aggregation";
import { adminDb } from "@/lib/firebase/admin";
import { ChallengePdfPage } from "@/features/reports/challenge-pdf";
import type { Challenge, Transaction } from "@/types";

export const runtime = "nodejs";

function responseError(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

export async function GET(request: Request): Promise<Response> {
  try {
    await assertRole("viewer");
  } catch {
    return responseError(401, "Authentication required.");
  }

  const url = new URL(request.url);
  const format = url.searchParams.get("format");
  if (url.searchParams.get("scope") === "transactions") {
    if (format !== "xlsx") return responseError(400, "Unsupported transaction export format.");
    const challengeId = url.searchParams.get("challengeId");
    const investorId = url.searchParams.get("investorId");
    const type = url.searchParams.get("type");
    const status = url.searchParams.get("status");
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    const idPattern = /^[A-Za-z0-9_-]{1,128}$/;
    if ((challengeId && !idPattern.test(challengeId)) || (investorId && !idPattern.test(investorId))) {
      return responseError(400, "Invalid transaction filter.");
    }
    if (type && !["UNITS", "STOCK_MARKET"].includes(type)) {
      return responseError(400, "Invalid transaction type filter.");
    }
    if (status && !["pending", "verified", "rejected"].includes(status)) {
      return responseError(400, "Invalid transaction status filter.");
    }
    const dateSchema = z.iso.date();
    if ((startDate && !dateSchema.safeParse(startDate).success) || (endDate && !dateSchema.safeParse(endDate).success)) {
      return responseError(400, "Invalid transaction date filter.");
    }
    if (startDate && endDate && startDate > endDate) {
      return responseError(400, "The start date must not be after the end date.");
    }

    const docs = await adminDb().collection("transactions").orderBy("createdAt", "desc").limit(10000).get();
    const rows = docs.docs
      .map((doc) => doc.data())
      .filter((row) =>
        (!challengeId || row.challengeId === challengeId) &&
        (!investorId || row.investorId === investorId) &&
        (!type || row.type === type) &&
        (!status || row.status === status) &&
        (!startDate || (typeof row.date === "string" && row.date >= startDate)) &&
        (!endDate || (typeof row.date === "string" && row.date <= endDate)),
      );
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Transactions");
    sheet.columns = [
      { header: "Date", key: "date", width: 14 },
      { header: "Investor", key: "investorName", width: 28 },
      { header: "Challenge", key: "challengeId", width: 28 },
      { header: "Type", key: "type", width: 16 },
      { header: "Amount (TZS)", key: "amount", width: 18 },
      { header: "Status", key: "status", width: 14 },
      { header: "Institution", key: "institution", width: 24 },
      { header: "Reference", key: "reference", width: 20 },
    ];
    for (const row of rows) sheet.addRow(row);
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    const bytes = await workbook.xlsx.writeBuffer();
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="vectora-transactions.xlsx"',
      },
    });
  }

  if (format !== "xlsx" && format !== "pdf") {
    return responseError(400, "Use format=xlsx or format=pdf.");
  }
  const db = adminDb();
  const challengeId = url.searchParams.get("challengeId");
  const includePending = url.searchParams.get("includePending") === "true";
  if (challengeId && !/^[A-Za-z0-9_-]{1,128}$/.test(challengeId)) {
    return responseError(400, "Invalid challenge id.");
  }
  let challengeSnap = challengeId ? await db.collection("challenges").doc(challengeId).get() : null;
  if (challengeId && !challengeSnap?.exists) return responseError(404, "Challenge not found.");
  if (!challengeSnap?.exists) {
    const open = await db.collection("challenges").where("status", "==", "open").limit(1).get();
    challengeSnap = open.docs[0] ?? null;
  }
  if (!challengeSnap?.exists) {
    const recent = await db.collection("challenges").orderBy("startDate", "desc").limit(1).get();
    challengeSnap = recent.docs[0] ?? null;
  }
  if (!challengeSnap?.exists) return responseError(404, "No challenge is available for export.");
  const challenge: Challenge = { id: challengeSnap.id, ...(challengeSnap.data() as Omit<Challenge, "id">) };
  const transactions = await db.collection("transactions").where("challengeId", "==", challenge.id).limit(20000).get();
  const list: Transaction[] = transactions.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<Transaction, "id">),
  }));
  const { investors, totals } = aggregateTransactions(list, includePending);

  if (format === "pdf") {
    const pdf = await renderToBuffer(
      createElement(
        Document,
        { title: `${challenge.title} report` },
        createElement(ChallengePdfPage, {
          title: challenge.title,
          rows: investors,
          totals: { units: totals.units, stock: totals.stock, final: totals.final },
          includePending,
        }),
      ),
    );
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${challenge.id}-summary.pdf"`,
      },
    });
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Challenge Summary");
  sheet.mergeCells("A1:E1");
  sheet.getCell("A1").value = challenge.title;
  sheet.getCell("A1").font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
  sheet.addRow(["No", "INVESTOR NAME", "UNITS", "STOCK MARKET", "TOTAL PER INVESTOR"]);
  sheet.getRow(2).font = { bold: true };
  sheet.columns = [
    { width: 8 },
    { width: 30 },
    { width: 18 },
    { width: 18 },
    { width: 22 },
  ];
  investors.forEach((investor, index) =>
    sheet.addRow([index + 1, investor.investorName, investor.units, investor.stock, investor.total]),
  );
  sheet.addRow(["", "TOTAL", totals.units, totals.stock, totals.final]);
  sheet.addRow(["", "FINAL TOTAL", "", "", totals.final]);
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber >= sheet.rowCount - 1) row.font = { bold: true };
    if (rowNumber > 2) {
      for (const cell of [row.getCell(3), row.getCell(4), row.getCell(5)]) {
        cell.numFmt = '"TZS" #,##0';
      }
    }
  });
  const bytes = await workbook.xlsx.writeBuffer();
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${challenge.id}-summary.xlsx"`,
    },
  });
}
