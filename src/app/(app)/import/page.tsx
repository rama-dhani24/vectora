import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { ImportManager } from "@/features/import/import-manager";
import { requireRole } from "@/lib/auth/dal";
import { adminDb } from "@/lib/firebase/admin";
import { serializeFirestoreData } from "@/lib/firebase/serialize";
import type { Challenge, Investor } from "@/types";

export const metadata: Metadata = { title: "Import" };

export default async function Page() {
  await requireRole("admin");
  const t = await getTranslations();
  const db = adminDb();
  const [challengeDocs, investorDocs] = await Promise.all([
    db.collection("challenges").orderBy("startDate", "desc").get(),
    db.collection("investors").orderBy("nameLower").get(),
  ]);
  const challenges: Challenge[] = challengeDocs.docs.map((doc) => ({
    id: doc.id,
    ...(serializeFirestoreData(doc.data()) as Omit<Challenge, "id">),
  }));
  const investors: Investor[] = investorDocs.docs.map((doc) => ({
    id: doc.id,
    ...(serializeFirestoreData(doc.data()) as Omit<Investor, "id">),
  }));
  return (
    <>
      <PageHeader title={t("nav.import")} description={t("pages.import")} />
      <ImportManager challenges={challenges} investors={investors} />
    </>
  );
}
