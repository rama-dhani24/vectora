import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { ReportsView } from "@/features/reports/reports-view";
import { requireRole } from "@/lib/auth/dal";
import type { Challenge, Transaction } from "@/types";
import { createClient } from "@/lib/supabase/server";
import { mapChallenge, mapTransaction, withSignedProofUrls } from "@/lib/supabase/mappers";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ challengeId?: string }>;
}) {
  const user = await requireRole("viewer");
  const params = await searchParams;
  const supabase = await createClient();
  const [challengeResult, transactionResult] = await Promise.all([
    supabase
      .from("challenges")
      .select("*")
      .eq("group_id", user.groupId)
      .order("start_date", { ascending: false }),
    supabase
      .from("transactions")
      .select("*")
      .eq("group_id", user.groupId)
      .order("date", { ascending: false })
      .limit(20000),
  ]);
  const challenges: Challenge[] = (challengeResult.data ?? []).map(mapChallenge);
  const selectedChallengeId =
    (params.challengeId && challenges.some((item) => item.id === params.challengeId)
      ? params.challengeId
      : challenges.find((item) => item.status === "open")?.id) ??
    challenges[0]?.id ??
    "";
  const allTransactions: Transaction[] = await withSignedProofUrls(
    supabase,
    (transactionResult.data ?? []).map(mapTransaction),
  );
  const t = await getTranslations();
  const pages = await getTranslations("pages");

  return (
    <div className="space-y-5">
      <PageHeader title={t("nav.reports")} description={pages("reports")} />
      <ReportsView
        challenges={challenges}
        allTransactions={allTransactions}
        selectedChallengeId={selectedChallengeId}
      />
    </div>
  );
}
