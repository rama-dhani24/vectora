import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { ImportManager } from "@/features/import/import-manager";
import { requireRole } from "@/lib/auth/dal";
import type { Challenge, Investor } from "@/types";
import { createClient } from "@/lib/supabase/server";
import { mapChallenge, mapInvestor } from "@/lib/supabase/mappers";

export const metadata: Metadata = { title: "Import" };

export default async function Page() {
  const user = await requireRole("admin");
  const t = await getTranslations();
  const supabase = await createClient();
  const [challengeResult, investorResult] = await Promise.all([
    supabase
      .from("challenges")
      .select("*")
      .eq("group_id", user.groupId)
      .order("start_date", { ascending: false }),
    supabase.from("investors").select("*").eq("group_id", user.groupId).order("name_lower"),
  ]);
  const challenges: Challenge[] = (challengeResult.data ?? []).map(mapChallenge);
  const investors: Investor[] = (investorResult.data ?? []).map(mapInvestor);
  return (
    <>
      <PageHeader title={t("nav.import")} description={t("pages.import")} />
      <ImportManager challenges={challenges} investors={investors} />
    </>
  );
}
