import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { ReportsView } from "@/features/reports/reports-view";
import { requireRole } from "@/lib/auth/dal";
import { adminDb } from "@/lib/firebase/admin";
import { serializeFirestoreData } from "@/lib/firebase/serialize";
import type { Challenge, Transaction } from "@/types";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ challengeId?: string }>;
}) {
  await requireRole("viewer");
  const params = await searchParams;
  const db = adminDb();
  const [challengeDocs, transactionDocs] = await Promise.all([
    db.collection("challenges").orderBy("startDate", "desc").get(),
    db.collection("transactions").orderBy("date", "desc").limit(20000).get(),
  ]);
  const challenges: Challenge[] = challengeDocs.docs.map((doc) => ({
    id: doc.id,
    ...(serializeFirestoreData(doc.data()) as Omit<Challenge, "id">),
  }));
  const selectedChallengeId =
    (params.challengeId && challenges.some((item) => item.id === params.challengeId)
      ? params.challengeId
      : challenges.find((item) => item.status === "open")?.id) ??
    challenges[0]?.id ??
    "";
  const allTransactions: Transaction[] = transactionDocs.docs.map((doc) => ({
    id: doc.id,
    ...(serializeFirestoreData(doc.data()) as Omit<Transaction, "id">),
  }));
  const t = await getTranslations();
  const pages = await getTranslations("pages");

  return (
    <div className="space-y-5">
      <PageHeader title={t("nav.reports")} description={pages("reports")} />
      <ReportsView
        challenges={challenges}
        allTransactions={allTransactions}
        selectedChallengeId={selectedChallengeId}
      />
    </div>
  );
}
