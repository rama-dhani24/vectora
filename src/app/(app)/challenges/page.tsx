import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/lib/auth/dal";
import { adminDb } from "@/lib/firebase/admin";
import { ChallengesManager } from "@/features/challenges/challenges-manager";
import type { ChallengeSummary } from "@/types";

export const metadata: Metadata = { title: "Challenges" };

export default async function Page() {
  const user = await requireRole("admin");
  const t = await getTranslations();
  const snapshot = await adminDb().collection("challenges").orderBy("startDate", "desc").get();
  const challenges: ChallengeSummary[] = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      title: typeof data.title === "string" ? data.title : "",
      month: typeof data.month === "number" ? data.month : 1,
      year: typeof data.year === "number" ? data.year : new Date().getFullYear(),
      startDate: typeof data.startDate === "string" ? data.startDate : "",
      endDate: typeof data.endDate === "string" ? data.endDate : "",
      status: data.status === "open" || data.status === "closed" ? data.status : "draft",
    };
  });
  return (
    <>
      <PageHeader title={t("nav.challenges")} description={t("pages.challenges")} />
      <ChallengesManager challenges={challenges} role={user.role} />
    </>
  );
}
