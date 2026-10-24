import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/lib/auth/dal";
import { ChallengesManager } from "@/features/challenges/challenges-manager";
import type { ChallengeSummary } from "@/types";
import { createClient } from "@/lib/supabase/server";
import { mapChallengeSummary } from "@/lib/supabase/mappers";

export const metadata: Metadata = { title: "Challenges" };

export default async function Page() {
  const user = await requireRole("admin");
  const t = await getTranslations();
  const supabase = await createClient();
  const { data } = await supabase
    .from("challenges")
    .select("*")
    .eq("group_id", user.groupId)
    .order("start_date", { ascending: false });
  const challenges: ChallengeSummary[] = (data ?? []).map(mapChallengeSummary);
  return (
    <>
      <PageHeader title={t("nav.challenges")} description={t("pages.challenges")} />
      <ChallengesManager challenges={challenges} role={user.role} />
    </>
  );
}
