import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/lib/auth/dal";
import { adminDb } from "@/lib/firebase/admin";
import { ChallengesManager } from "@/features/challenges/challenges-manager";
import type { Challenge } from "@/types";

export const metadata: Metadata = { title: "Challenges" };

export default async function Page() {
  const user = await requireRole("admin");
  const t = await getTranslations();
  const snapshot = await adminDb().collection("challenges").orderBy("startDate", "desc").get();
  const challenges: Challenge[] = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<Challenge, "id">),
  }));
  return (
    <>
      <PageHeader title={t("nav.challenges")} description={t("pages.challenges")} />
      <ChallengesManager challenges={challenges} role={user.role} />
    </>
  );
}
