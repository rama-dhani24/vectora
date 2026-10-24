import ExcelJS from "exceljs";
import { createElement } from "react";
import { Document, renderToBuffer } from "@react-pdf/renderer";
import { z } from "zod";
import { assertRole } from "@/lib/auth/dal";
import { aggregateTransactions } from "@/lib/domain/aggregation";
import { ChallengePdfPage } from "@/features/reports/challenge-pdf";
import type { Challenge, SessionUser, Transaction } from "@/types";
import { createClient } from "@/lib/supabase/server";
import { mapChallenge, mapTransaction, withSignedProofUrls } from "@/lib/supabase/mappers";

export const runtime = "nodejs";

function responseError(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

export async function GET(request: Request): Promise<Response> {
  let actor: SessionUser;
  try {
    actor = await assertRole("viewer");
  } catch {
    return responseError(401, "Authentication required.");
  }

  const url = new URL(request.url);
  const supabase = await createClient();
  const format = url.searchParams.get("format");
  if (url.searchParams.get("scope") === "transactions") {
    if (format !== "xlsx") return responseError(400, "Unsupported transaction export format.");
    const challengeId = url.searchParams.get("challengeId");
    const investorId = url.searchParams.get("investorId");
    const type = url.searchParams.get("type");
    const status = url.searchParams.get("status");
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    const idPattern = /^[0-9a-f-]{36}$/i;
    if (
      (challengeId && !idPattern.test(challengeId)) ||
      (investorId && !idPattern.test(investorId))
    ) {
      return responseError(400, "Invalid transaction filter.");
    }
    if (type && !["UNITS", "STOCK_MARKET"].includes(type)) {
      return responseError(400, "Invalid transaction type filter.");
    }
    if (status && !["pending", "verified", "rejected"].includes(status)) {
      return responseError(400, "Invalid transaction status filter.");
    }
    const dateSchema = z.iso.date();
    if (
      (startDate && !dateSchema.safeParse(startDate).success) ||
      (endDate && !dateSchema.safeParse(endDate).success)
    ) {
      return responseError(400, "Invalid transaction date filter.");
    }
    if (startDate && endDate && startDate > endDate) {
      return responseError(400, "The start date must not be after the end date.");
    }

    let query = supabase
      .from("transactions")
      .select("*")
      .eq("group_id", actor.groupId)
      .order("created_at", { ascending: false })
      .limit(10000);
    if (challengeId) query = query.eq("challenge_id", challengeId);
    if (investorId) query = query.eq("investor_id", investorId);
    if (type) query = query.eq("type", type);
    if (status) query = query.eq("status", status);
    if (startDate) query = query.gte("date", startDate);
    if (endDate) query = query.lte("date", endDate);
    const { data: transactionRows, error: queryError } = await query;
    if (queryError) return responseError(500, "Could not load transactions.");
    const rows = (transactionRows ?? []).map(mapTransaction);
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
    for (const row of rows) sheet.addRow({ ...row, challengeId: row.challengeId });
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
  const challengeId = url.searchParams.get("challengeId");
  const includePending = url.searchParams.get("includePending") === "true";
  if (challengeId && !/^[0-9a-f-]{36}$/i.test(challengeId)) {
    return responseError(400, "Invalid challenge id.");
  }
  const challengeQuery = supabase.from("challenges").select("*").eq("group_id", actor.groupId);
  let challengeRow: Parameters<typeof mapChallenge>[0] | null = null;
  if (challengeId) {
    const { data } = await challengeQuery.eq("id", challengeId).maybeSingle();
    challengeRow = data;
    if (!challengeRow) return responseError(404, "Challenge not found.");
  } else {
    const open = await challengeQuery.eq("status", "open").limit(1).maybeSingle();
    challengeRow = open.data;
    if (!challengeRow) {
      const recent = await supabase
        .from("challenges")
        .select("*")
        .eq("group_id", actor.groupId)
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      challengeRow = recent.data;
    }
  }
  if (!challengeRow) return responseError(404, "No challenge is available for export.");
  const challenge: Challenge = mapChallenge(challengeRow);
  const transactionResult = await supabase
    .from("transactions")
    .select("*")
    .eq("group_id", actor.groupId)
    .eq("challenge_id", challenge.id)
    .limit(20000);
  const list: Transaction[] = await withSignedProofUrls(
    supabase,
    (transactionResult.data ?? []).map(mapTransaction),
  );
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
  sheet.columns = [{ width: 8 }, { width: 30 }, { width: 18 }, { width: 18 }, { width: 22 }];
  investors.forEach((investor, index) =>
    sheet.addRow([
      index + 1,
      investor.investorName,
      investor.units,
      investor.stock,
      investor.total,
    ]),
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
