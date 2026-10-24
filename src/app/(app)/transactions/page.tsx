import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TransactionsManager } from "@/features/transactions/transactions-manager";
import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/lib/auth/dal";
import type { Challenge, Investor, Transaction } from "@/types";
import { createClient } from "@/lib/supabase/server";
import {
  mapChallenge,
  mapInvestor,
  mapTransaction,
  withSignedProofUrls,
} from "@/lib/supabase/mappers";

export const metadata: Metadata = { title: "Transactions" };

export default async function Page() {
  const user = await requireRole("admin");
  const t = await getTranslations();
  const supabase = await createClient();
  const [transactionResult, challengeResult, investorResult] = await Promise.all([
    supabase
      .from("transactions")
      .select("*")
      .eq("group_id", user.groupId)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("challenges")
      .select("*")
      .eq("group_id", user.groupId)
      .order("start_date", { ascending: false }),
    supabase.from("investors").select("*").eq("group_id", user.groupId).order("name_lower"),
  ]);
  const transactions: Transaction[] = await withSignedProofUrls(
    supabase,
    (transactionResult.data ?? []).map(mapTransaction),
  );
  const challenges: Challenge[] = (challengeResult.data ?? []).map(mapChallenge);
  const investors: Investor[] = (investorResult.data ?? []).map(mapInvestor);
  return (
    <>
      <PageHeader title={t("nav.transactions")} description={t("pages.transactions")} />
      <TransactionsManager
        transactions={transactions}
        challenges={challenges}
        investors={investors}
        groupId={user.groupId}
      />
    </>
  );
}
