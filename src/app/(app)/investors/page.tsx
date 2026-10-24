import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { InvestorsManager } from "@/features/investors/investors-manager";
import { requireRole } from "@/lib/auth/dal";
import type { Investor } from "@/types";
import { createClient } from "@/lib/supabase/server";
import { mapInvestor } from "@/lib/supabase/mappers";

export const metadata: Metadata = { title: "Investors" };

export default async function Page() {
  const user = await requireRole("admin");
  const t = await getTranslations();
  const supabase = await createClient();
  const { data } = await supabase
    .from("investors")
    .select("*")
    .eq("group_id", user.groupId)
    .order("name_lower");
  const investors: Investor[] = (data ?? []).map(mapInvestor);
  return (
    <>
      <PageHeader title={t("nav.investors")} description={t("pages.investors")} />
      <InvestorsManager investors={investors} />
    </>
  );
}
