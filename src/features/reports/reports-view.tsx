"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { aggregateTransactions, type InvestorAggregate } from "@/lib/domain/aggregation";
import { formatTzs } from "@/lib/money";
import type { Challenge, Transaction } from "@/types";

export function ReportsView({
  challenges,
  allTransactions,
  selectedChallengeId,
}: {
  challenges: Challenge[];
  allTransactions: Transaction[];
  selectedChallengeId: string;
}) {
  const t = useTranslations("features.reports");
  const [challengeId, setChallengeId] = useState(selectedChallengeId);
  const [includePending, setIncludePending] = useState(false);
  const [sort, setSort] = useState("first");
  const selectedChallenge = challenges.find((item) => item.id === challengeId);
  const challengeTransactions = allTransactions.filter((item) => item.challengeId === challengeId);
  const report = aggregateTransactions(challengeTransactions, includePending);
  const rows = [...report.investors];
  if (sort === "alphabetical") rows.sort((a, b) => a.investorName.localeCompare(b.investorName));
  if (sort === "total") rows.sort((a, b) => b.total - a.total || a.investorName.localeCompare(b.investorName));

  const challengeComparisons = challenges.map((challenge) => ({
    challenge,
    totals: aggregateTransactions(allTransactions.filter((item) => item.challengeId === challenge.id)).totals,
  }));
  const statementInvestorIds = [...new Set(allTransactions.map((item) => item.investorId))];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-end">
        <div className="space-y-1">
          <label htmlFor="report-challenge" className="text-sm font-medium">{t("challenge")}</label>
          <select id="report-challenge" value={challengeId} onChange={(event) => setChallengeId(event.target.value)} className="border-input bg-background h-9 min-w-60 rounded-lg border px-2 text-sm">
            {challenges.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="report-sort" className="text-sm font-medium">{t("sort")}</label>
          <select id="report-sort" value={sort} onChange={(event) => setSort(event.target.value)} className="border-input bg-background h-9 rounded-lg border px-2 text-sm">
            <option value="first">{t("first")}</option>
            <option value="alphabetical">{t("alphabetical")}</option>
            <option value="total">{t("highest")}</option>
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={includePending} onChange={(event) => setIncludePending(event.target.checked)} />
          {t("includePending")}
        </label>
        <div className="ml-auto flex gap-2">
          <a href={`/api/reports?format=xlsx&challengeId=${encodeURIComponent(challengeId)}&includePending=${includePending}`}>
            <Button type="button" variant="outline">{t("excel")}</Button>
          </a>
          <a href={`/api/reports?format=pdf&challengeId=${encodeURIComponent(challengeId)}&includePending=${includePending}`} target="_blank" rel="noreferrer">
            <Button type="button">{t("pdf")}</Button>
          </a>
        </div>
      </div>

      {selectedChallenge ? (
        <section className="overflow-x-auto rounded-xl border">
          <div className="bg-muted/30 px-4 py-3">
            <h2 className="font-semibold">{selectedChallenge.title}</h2>
            <p className="text-muted-foreground text-sm">{t("summary", { status: includePending ? t("verifiedAndPending") : t("verifiedOnly") })}</p>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50">
              <tr><th className="px-4 py-3">{t("number")}</th><th className="px-4 py-3">{t("investorName")}</th><th className="px-4 py-3 text-right">{t("units")}</th><th className="px-4 py-3 text-right">{t("stock")}</th><th className="px-4 py-3 text-right">{t("investorTotal")}</th></tr>
            </thead>
            <tbody>
              {rows.map((row, index) => <SummaryRow key={row.investorId} row={row} index={index} />)}
              {!rows.length ? <tr><td colSpan={5} className="text-muted-foreground px-4 py-8 text-center">{t("empty")}</td></tr> : null}
            </tbody>
            <tfoot className="bg-muted/30 font-semibold">
              <tr><td colSpan={2} className="px-4 py-3">{t("total")}</td><td className="px-4 py-3 text-right tabular-nums">{formatTzs(report.totals.units)}</td><td className="px-4 py-3 text-right tabular-nums">{formatTzs(report.totals.stock)}</td><td className="px-4 py-3 text-right tabular-nums">{formatTzs(report.totals.final)}</td></tr>
              <tr><td colSpan={4} className="px-4 py-3">{t("finalTotal")}</td><td className="px-4 py-3 text-right tabular-nums">{formatTzs(report.totals.final)}</td></tr>
            </tfoot>
          </table>
          <div className="flex gap-2 border-t px-4 py-3">
            <Badge variant="secondary">{t("participants", { count: report.totals.participants })}</Badge>
            <Badge variant="outline">{t("pendingCount", { count: challengeTransactions.filter((item) => item.status === "pending").length })}</Badge>
          </div>
        </section>
      ) : <p className="text-muted-foreground rounded-xl border p-8 text-center">{t("createChallenge")}</p>}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("statements")}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {statementInvestorIds.map((investorId) => {
            const txs = allTransactions.filter((item) => item.investorId === investorId);
            const total = aggregateTransactions(txs).totals.final;
            const investorName = txs[0]?.investorName ?? "Investor";
            return (
              <details key={investorId} className="rounded-xl border p-4">
                <summary className="cursor-pointer font-medium">{investorName}<span className="text-muted-foreground ml-2 text-sm">{formatTzs(total)}</span></summary>
                <ul className="mt-3 space-y-2 text-sm">
                  {txs.sort((a, b) => b.date.localeCompare(a.date)).map((item) => (
                    <li key={item.id} className="border-t pt-2">
                      <div className="flex justify-between gap-2"><span>{item.date} · {item.type === "UNITS" ? "Units" : "Stock Market"}</span><span>{formatTzs(item.amount)}</span></div>
                      <div className="text-muted-foreground">{challenges.find((challenge) => challenge.id === item.challengeId)?.title} · {item.status}</div>
                      {item.proofUrl ? <a className="mt-1 inline-flex items-center gap-2 text-primary underline" href={item.proofUrl} target="_blank" rel="noreferrer"><Image src={item.proofUrl} alt={t("viewProof")} width={48} height={48} unoptimized className="size-12 rounded object-cover" />{t("viewProof")}</a> : null}
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("comparison")}</h2>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50"><tr><th className="px-4 py-3">{t("challengeName")}</th><th className="px-4 py-3 text-right">{t("units")}</th><th className="px-4 py-3 text-right">{t("stockMarket")}</th><th className="px-4 py-3 text-right">{t("grandTotal")}</th><th className="px-4 py-3 text-right">{t("participantsHeader")}</th></tr></thead>
            <tbody>
              {challengeComparisons.map(({ challenge, totals }) => <tr key={challenge.id} className="border-t"><td className="px-4 py-3">{challenge.title}</td><td className="px-4 py-3 text-right tabular-nums">{formatTzs(totals.units)}</td><td className="px-4 py-3 text-right tabular-nums">{formatTzs(totals.stock)}</td><td className="px-4 py-3 text-right tabular-nums">{formatTzs(totals.final)}</td><td className="px-4 py-3 text-right">{totals.participants}</td></tr>)}
              {!challengeComparisons.length ? <tr><td colSpan={5} className="text-muted-foreground px-4 py-6 text-center">{t("emptyChallenges")}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SummaryRow({ row, index }: { row: InvestorAggregate; index: number }) {
  return (
    <tr className="border-t">
      <td className="px-4 py-3">{index + 1}</td>
      <td className="px-4 py-3 font-medium">{row.investorName}</td>
      <td className="px-4 py-3 text-right tabular-nums">{formatTzs(row.units)}</td>
      <td className="px-4 py-3 text-right tabular-nums">{formatTzs(row.stock)}</td>
      <td className="px-4 py-3 text-right font-medium tabular-nums">{formatTzs(row.total)}</td>
    </tr>
  );
}
