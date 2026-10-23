import { CalendarDays, Coins, PieChart, Users } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/dal";
import { adminDb } from "@/lib/firebase/admin";
import { formatTzs } from "@/lib/money";
import type { ChallengeTotals } from "@/types";

export const metadata: Metadata = { title: "Dashboard" };

const EMPTY_TOTALS: ChallengeTotals = { units: 0, stock: 0, final: 0, participants: 0 };

async function getOpenChallenge(): Promise<{ title: string; totals: ChallengeTotals } | null> {
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
    title: typeof data.title === "string" ? data.title : "",
    totals: { ...EMPTY_TOTALS, ...totals },
  };
}

export default async function DashboardPage() {
  const user = await requireUser();
  const t = await getTranslations();
  const challenge = await getOpenChallenge();
  const totals = challenge?.totals ?? EMPTY_TOTALS;

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
    </>
  );
}
