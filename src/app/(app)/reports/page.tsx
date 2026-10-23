import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ComingSoon } from "@/components/layout/coming-soon";
import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Reports" };

export default async function Page() {
  await requireRole("viewer");
  const t = await getTranslations();
  return (
    <>
      <PageHeader title={t("nav.reports")} description={t("pages.reports")} />
      <ComingSoon milestone={7} />
    </>
  );
}
