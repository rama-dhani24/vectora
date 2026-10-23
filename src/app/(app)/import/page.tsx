import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ComingSoon } from "@/components/layout/coming-soon";
import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Import" };

export default async function Page() {
  await requireRole("admin");
  const t = await getTranslations();
  return (
    <>
      <PageHeader title={t("nav.import")} description={t("pages.import")} />
      <ComingSoon milestone={8} />
    </>
  );
}
