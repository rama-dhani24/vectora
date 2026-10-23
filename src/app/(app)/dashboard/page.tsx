import { CalendarDays, Coins, PieChart, Users } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/dal";
import { adminDb } from "@/lib/firebase/admin";
import { aggregateTransactions } from "@/lib/domain/aggregation";
import { formatTzs } from "@/lib/money";
import type { ChallengeTotals, Transaction } from "@/types";

export const metadata: Metadata = { title: "Dashboard" };

const EMPTY_TOTALS: ChallengeTotals = { units: 0, stock: 0, final: 0, participants: 0 };

async function getOpenChallenge(): Promise<{ id: string; title: string; totals: ChallengeTotals } | null> {
  const snap = await adminDb()
    .collection("challenges")
    .where("status", "==", "open")
    .limit(1)
    .get();
  const doc = snap.docs[0];
  if (!doc) return null;
  const data = doc.data();
  const totals = data.totals as Partial<ChallengeTotals> | undefined;
  return {
    id: doc.id,
    title: typeof data.title === "string" ? data.title : "",
    totals: { ...EMPTY_TOTALS, ...totals },
  };
}

export default async function DashboardPage() {
  const user = await requireUser();
  const t = await getTranslations();
  const challenge = await getOpenChallenge();
  const transactionDocs = challenge
    ? await adminDb().collection("transactions").where("challengeId", "==", challenge.id).limit(10000).get()
    : null;
  const transactions: Transaction[] =
    transactionDocs?.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<Transaction, "id">),
    })) ?? [];
  const aggregate = aggregateTransactions(transactions);
  const totals = challenge ? aggregate.totals : EMPTY_TOTALS;
  const topInvestors = aggregate.investors.toSorted((a, b) => b.total - a.total).slice(0, 5);
  const daily = new Map<string, number>();
  for (const transaction of transactions) {
    if (transaction.status !== "verified") continue;
    daily.set(transaction.date, (daily.get(transaction.date) ?? 0) + transaction.amount);
  }
  const dailyTotals = [...daily.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-14);
  const largestDay = Math.max(1, ...dailyTotals.map(([, total]) => total));

  const stats = [
    { label: t("dashboard.totalInvested"), value: formatTzs(totals.final), icon: Coins },
    { label: t("common.units"), value: formatTzs(totals.units), icon: PieChart },
    { label: t("common.stockMarket"), value: formatTzs(totals.stock), icon: PieChart },
    { label: t("dashboard.participants"), value: String(totals.participants), icon: Users },
  ];

  return (
    <>
      <PageHeader
        title={t("dashboard.welcome", { name: user.name })}
        description={t("app.tagline")}
      />
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center gap-2">
          <CalendarDays className="text-muted-foreground size-4" aria-hidden />
          <CardTitle className="text-base">{t("dashboard.currentChallenge")}</CardTitle>
        </CardHeader>
        <CardContent>
          {challenge ? (
            <div className="flex items-center gap-2">
              <span className="font-semibold">{challenge.title}</span>
              <Badge>
                {t("common.total")}: {formatTzs(totals.final)}
              </Badge>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">{t("dashboard.noOpenChallenge")}</p>
          )}
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-muted-foreground text-sm font-medium">
                {stat.label}
              </CardTitle>
              <stat.icon className="text-muted-foreground size-4" aria-hidden />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      {challenge ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base">{t("dashboard.topInvestors")}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {topInvestors.map((investor, index) => (
                <div key={investor.investorId} className="space-y-1">
                  <div className="flex justify-between gap-3 text-sm"><span>{index + 1}. {investor.investorName}</span><span className="tabular-nums">{formatTzs(investor.total)}</span></div>
                  <div className="bg-muted h-2 overflow-hidden rounded-full"><div className="bg-primary h-full rounded-full" style={{ width: `${Math.max(2, (investor.total / Math.max(1, topInvestors[0]?.total ?? 1)) * 100)}%` }} /></div>
                </div>
              ))}
              {!topInvestors.length ? <p className="text-muted-foreground text-sm">{t("dashboard.noVerifiedTransactions")}</p> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">{t("dashboard.investmentOverTime")}</CardTitle></CardHeader>
            <CardContent>
              {dailyTotals.length ? (
                <div className="flex h-40 items-end gap-2">
                  {dailyTotals.map(([date, amount]) => (
                    <div key={date} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2" title={`${date}: ${formatTzs(amount)}`}>
                      <div className="bg-primary w-full max-w-8 rounded-t" style={{ height: `${Math.max(3, (amount / largestDay) * 100)}%` }} />
                      <span className="text-muted-foreground text-[10px]">{date.slice(5)}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-muted-foreground text-sm">{t("dashboard.noVerifiedTransactions")}</p>}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}
