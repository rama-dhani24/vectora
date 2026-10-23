import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { InvestorsManager } from "@/features/investors/investors-manager";
import { requireRole } from "@/lib/auth/dal";
import { adminDb } from "@/lib/firebase/admin";
import type { Investor } from "@/types";

export const metadata: Metadata = { title: "Investors" };

export default async function Page() {
  await requireRole("admin");
  const t = await getTranslations();
  const snapshot = await adminDb().collection("investors").orderBy("nameLower").get();
  const investors: Investor[] = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<Investor, "id">),
  }));
  return (
    <>
      <PageHeader title={t("nav.investors")} description={t("pages.investors")} />
      <InvestorsManager investors={investors} />
    </>
  );
}
