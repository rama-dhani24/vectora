import {
  ArrowUpRight,
  CalendarDays,
  ChartNoAxesCombined,
  Coins,
  PieChart,
  Plus,
  Users,
} from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/dal";
import { adminDb } from "@/lib/firebase/admin";
import { aggregateTransactions } from "@/lib/domain/aggregation";
import { formatTzs } from "@/lib/money";
import type { ChallengeTotals, Transaction } from "@/types";

export const metadata: Metadata = { title: "Dashboard" };

const EMPTY_TOTALS: ChallengeTotals = { units: 0, stock: 0, final: 0, participants: 0 };

async function getOpenChallenge(): Promise<{
  id: string;
  title: string;
  totals: ChallengeTotals;
} | null> {
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
    ? await adminDb()
        .collection("transactions")
        .where("challengeId", "==", challenge.id)
        .limit(10000)
        .get()
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
        actions={
          <Link href="/transactions" className={buttonVariants()}>
            <Plus className="size-4" /> {t("dashboard.addTransaction")}
          </Link>
        }
      />
      <section className="bg-primary text-primary-foreground shadow-primary/10 relative mb-6 overflow-hidden rounded-3xl px-6 py-7 shadow-xl sm:px-8 sm:py-8">
        <div className="pointer-events-none absolute -top-24 -right-10 size-72 rounded-full border border-current/10 sm:size-96" />
        <div className="pointer-events-none absolute -top-16 -right-2 size-56 rounded-full border border-current/10 sm:size-72" />
        <div className="relative flex flex-col justify-between gap-7 sm:flex-row sm:items-end">
          <div className="max-w-xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1.5 text-xs font-semibold tracking-wide">
              <CalendarDays className="size-3.5" aria-hidden /> {t("dashboard.currentChallenge")}
            </div>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {challenge?.title ?? t("dashboard.noOpenChallenge")}
            </h2>
            <p className="text-primary-foreground/75 mt-2 text-sm">
              {challenge ? t("dashboard.challengeProgress") : t("dashboard.createChallengeHint")}
            </p>
          </div>
          <div className="flex items-end justify-between gap-5 sm:justify-end">
            <div>
              <p className="text-primary-foreground/70 text-xs font-medium">
                {t("dashboard.totalInvested")}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums sm:text-3xl">
                {formatTzs(totals.final)}
              </p>
            </div>
            <Link
              href={challenge ? "/reports" : "/challenges"}
              className={buttonVariants({
                variant: "secondary",
                className: "text-primary mb-0.5 bg-white hover:bg-white/90",
              })}
            >
              {challenge ? t("dashboard.viewReport") : t("dashboard.createChallenge")}
              <ArrowUpRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <Card
            key={stat.label}
            className="border-border/70 shadow-foreground/[0.025] shadow-sm transition-transform duration-200 hover:-translate-y-0.5"
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                {stat.label}
              </CardTitle>
              <span
                className={`flex size-9 items-center justify-center rounded-xl ${index === 0 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
              >
                <stat.icon className="size-[17px]" aria-hidden />
              </span>
            </CardHeader>
            <CardContent>
              <p className="text-[1.35rem] font-semibold tracking-tight tabular-nums sm:text-2xl">
                {stat.value}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                {t("dashboard.activeChallengeMetric")}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      {challenge ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Card className="shadow-foreground/[0.025] shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t("dashboard.topInvestors")}</CardTitle>
              <Users className="text-muted-foreground size-4" aria-hidden />
            </CardHeader>
            <CardContent className="space-y-4">
              {topInvestors.map((investor, index) => (
                <div key={investor.investorId} className="flex items-center gap-3">
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${index === 0 ? "bg-primary/12 text-primary" : "bg-muted text-muted-foreground"}`}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex justify-between gap-3 text-sm">
                      <span className="truncate font-medium">{investor.investorName}</span>
                      <span className="shrink-0 font-medium tabular-nums">
                        {formatTzs(investor.total)}
                      </span>
                    </div>
                    <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                      <div
                        className="bg-primary h-full rounded-full"
                        style={{
                          width: `${Math.max(2, (investor.total / Math.max(1, topInvestors[0]?.total ?? 1)) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
              {!topInvestors.length ? (
                <p className="text-muted-foreground text-sm">
                  {t("dashboard.noVerifiedTransactions")}
                </p>
              ) : null}
            </CardContent>
          </Card>
          <Card className="shadow-foreground/[0.025] shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t("dashboard.investmentOverTime")}</CardTitle>
              <ChartNoAxesCombined className="text-muted-foreground size-4" aria-hidden />
            </CardHeader>
            <CardContent>
              {dailyTotals.length ? (
                <div className="bg-muted/45 flex h-44 items-end gap-2 rounded-xl px-3 pt-4">
                  {dailyTotals.map(([date, amount]) => (
                    <div
                      key={date}
                      className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"
                      title={`${date}: ${formatTzs(amount)}`}
                    >
                      <div
                        className="from-primary/65 to-primary w-full max-w-8 rounded-t-md bg-gradient-to-t"
                        style={{ height: `${Math.max(3, (amount / largestDay) * 100)}%` }}
                      />
                      <span className="text-muted-foreground text-[10px]">{date.slice(5)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  {t("dashboard.noVerifiedTransactions")}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}
