import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TransactionsManager } from "@/features/transactions/transactions-manager";
import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/lib/auth/dal";
import { adminDb } from "@/lib/firebase/admin";
import type { Challenge, Investor, Transaction } from "@/types";

export const metadata: Metadata = { title: "Transactions" };

export default async function Page() {
  await requireRole("admin");
  const t = await getTranslations();
  const db = adminDb();
  const [transactionDocs, challengeDocs, investorDocs] = await Promise.all([
    db.collection("transactions").orderBy("createdAt", "desc").limit(500).get(),
    db.collection("challenges").orderBy("startDate", "desc").get(),
    db.collection("investors").orderBy("nameLower").get(),
  ]);
  const transactions: Transaction[] = transactionDocs.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<Transaction, "id">),
  }));
  const challenges: Challenge[] = challengeDocs.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<Challenge, "id">),
  }));
  const investors: Investor[] = investorDocs.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<Investor, "id">),
  }));
  return (
    <>
      <PageHeader title={t("nav.transactions")} description={t("pages.transactions")} />
      <TransactionsManager transactions={transactions} challenges={challenges} investors={investors} />
    </>
  );
}
