"use client";

import ExcelJS from "exceljs";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { importSheetAction } from "@/features/import/actions";
import { parseReportSheet, type ParsedSheet } from "@/lib/import/parse-report-sheet";
import { reconcileTotals } from "@/lib/domain/aggregation";
import { formatTzs } from "@/lib/money";
import type { Challenge, Investor } from "@/types";

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value.trim());
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function ImportManager({
  challenges,
  investors,
}: {
  challenges: Challenge[];
  investors: Investor[];
}) {
  const t = useTranslations("features.import");
  const [parsed, setParsed] = useState<ParsedSheet | null>(null);
  const [challengeId, setChallengeId] = useState(
    challenges.find((item) => item.status === "open")?.id ?? "",
  );
  const [pending, startTransition] = useTransition();
  const reconciliation = useMemo(
    () => parsed && reconcileTotals(parsed.rows, parsed.expected),
    [parsed],
  );

  async function selectFile(file: File) {
    const workbook = new ExcelJS.Workbook();
    if (file.name.toLowerCase().endsWith(".csv")) {
      const worksheet = workbook.addWorksheet("Import");
      for (const row of parseCsv(await file.text())) worksheet.addRow(row);
    } else if (file.name.toLowerCase().endsWith(".xlsx")) {
      await workbook.xlsx.load(await file.arrayBuffer());
    } else {
      throw new Error(t("extension"));
    }
    const result = parseReportSheet(workbook);
    const nameMap = new Map(
      investors.map((investor) => [investor.name.toLocaleLowerCase("en"), investor.id]),
    );
    result.rows = result.rows.map((row) => ({
      ...row,
      investorId: nameMap.get(row.name.toLocaleLowerCase("en")),
    }));
    setParsed(result);
    toast.success(t("parsed", { count: result.rows.length }));
  }

  function setMapping(index: number, investorId: string) {
    setParsed((current) => {
      if (!current) return current;
      const rows = current.rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, investorId: investorId || undefined } : row,
      );
      return { ...current, rows };
    });
  }

  function importNow() {
    if (!parsed || !reconciliation || !challengeId) return;
    startTransition(async () => {
      const result = await importSheetAction({
        challengeId,
        rows: parsed.rows,
        expected: parsed.expected,
      });
      if (result.ok) {
        toast.success(t("imported"));
        setParsed(null);
      } else {
        toast.error(result.error ?? t("failed"));
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-medium">
          {t("file")}
          <Input
            type="file"
            accept=".xlsx,.csv"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file)
                void selectFile(file).catch((error: unknown) =>
                  toast.error(error instanceof Error ? error.message : "Could not read file."),
                );
              event.target.value = "";
            }}
          />
        </label>
        <label className="space-y-2 text-sm font-medium">
          {t("challenge")}
          <select
            value={challengeId}
            onChange={(event) => setChallengeId(event.target.value)}
            className="form-control"
          >
            <option value="">{t("selectChallenge")}</option>
            {challenges
              .filter((item) => item.status === "open")
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
          </select>
        </label>
        <p className="text-muted-foreground text-sm sm:col-span-2">{t("requirements")}</p>
      </div>

      {parsed && reconciliation ? (
        <>
          <div
            className={`rounded-xl border p-4 text-sm ${reconciliation.matches ? "border-emerald-500/40" : "border-destructive/40"}`}
          >
            <h2 className="font-semibold">
              {reconciliation.matches ? t("reconciliationPassed") : t("reconciliationFailed")}
            </h2>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <p>
                {t("units")}: {formatTzs(reconciliation.actualUnits)} /{" "}
                {formatTzs(reconciliation.expectedUnits)}
              </p>
              <p>
                {t("stock")}: {formatTzs(reconciliation.actualStock)} /{" "}
                {formatTzs(reconciliation.expectedStock)}
              </p>
              <p>
                {t("final")}: {formatTzs(reconciliation.actualFinal)} /{" "}
                {formatTzs(reconciliation.expectedFinal)}
              </p>
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3">{t("sheetName")}</th>
                  <th className="px-4 py-3">{t("mapToInvestor")}</th>
                  <th className="px-4 py-3 text-right">{t("units")}</th>
                  <th className="px-4 py-3 text-right">{t("stock")}</th>
                </tr>
              </thead>
              <tbody>
                {parsed.rows.map((row, index) => (
                  <tr key={`${row.name}-${index}`} className="border-t">
                    <td className="px-4 py-2">{row.name}</td>
                    <td className="px-4 py-2">
                      <select
                        aria-label={`Map ${row.name}`}
                        value={row.investorId ?? ""}
                        onChange={(event) => setMapping(index, event.target.value)}
                        className="form-control h-10 max-w-64"
                      >
                        <option value="">{t("createInvestor", { name: row.name })}</option>
                        {investors.map((investor) => (
                          <option key={investor.id} value={investor.id}>
                            {investor.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatTzs(row.units)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatTzs(row.stock)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end">
            <Button
              disabled={pending || !challengeId || !reconciliation.matches}
              onClick={importNow}
            >
              {pending ? t("importing") : t("import", { count: parsed.rows.length })}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
