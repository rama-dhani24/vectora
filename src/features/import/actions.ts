"use server";

import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AuthorizationError, assertRole } from "@/lib/auth/dal";
import { adminDb } from "@/lib/firebase/admin";
import { reconcileTotals } from "@/lib/domain/aggregation";
import type { Challenge } from "@/types";

const importSchema = z.object({
  challengeId: z.string().min(1),
  rows: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        investorId: z.string().max(128).optional(),
        units: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
        stock: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      }),
    )
    .min(1)
    .max(80),
  expected: z.object({
    units: z.number().int().nonnegative(),
    stock: z.number().int().nonnegative(),
    final: z.number().int().nonnegative(),
  }),
});

export interface ImportResult {
  ok: boolean;
  error?: string;
  reconciliation?: ReturnType<typeof reconcileTotals>;
}

export async function importSheetAction(input: unknown): Promise<ImportResult> {
  try {
    const actor = await assertRole("admin");
    const data = importSchema.parse(input);
    const reconciliation = reconcileTotals(data.rows, data.expected);
    if (!reconciliation.matches) {
      return {
        ok: false,
        error: "The imported totals do not match the sheet totals. Correct the data before importing.",
        reconciliation,
      };
    }

    const db = adminDb();
    const challengeRef = db.collection("challenges").doc(data.challengeId);
    const challengeSnap = await challengeRef.get();
    if (!challengeSnap.exists) return { ok: false, error: "Choose an existing challenge." };
    const challenge = challengeSnap.data() as Partial<Challenge>;
    if (challenge.status !== "open") {
      return { ok: false, error: "Open the challenge before importing its transactions." };
    }

    const existing = await db.collection("investors").get();
    const byName = new Map(existing.docs.map((doc) => [String(doc.get("nameLower") ?? ""), doc]));
    const seen = new Set<string>();
    const seenInvestorIds = new Set<string>();
    const rows = data.rows.map((row) => {
      const nameLower = row.name.toLocaleLowerCase("en");
      if (seen.has(nameLower)) throw new Error(`Duplicate investor name in sheet: ${row.name}`);
      seen.add(nameLower);
      const matchedById = row.investorId ? existing.docs.find((doc) => doc.id === row.investorId) : undefined;
      if (row.investorId && !matchedById) {
        throw new Error(`The selected investor for ${row.name} no longer exists. Refresh the import preview.`);
      }
      const matched = matchedById ?? byName.get(nameLower);
      if (matched?.get("status") === "inactive") {
        throw new Error(`${row.name} is inactive. Select an active investor or create a new one.`);
      }
      const investorId = matched?.id ?? row.investorId ?? "";
      if (investorId && seenInvestorIds.has(investorId)) {
        throw new Error(`Multiple sheet rows map to the same investor: ${row.name}`);
      }
      if (investorId) seenInvestorIds.add(investorId);
      return { ...row, nameLower, investorId };
    });

    const now = new Date().toISOString();
    const batch = db.batch();
    const auditCollection = db.collection("auditLogs");
    let pendingWrites = 0;
    for (const row of rows) {
      let investorId = row.investorId;
      let investorName = row.name;
      if (!investorId) {
        const ref = db.collection("investors").doc();
        investorId = ref.id;
        const investor = {
          name: row.name,
          nameLower: row.nameLower,
          status: "active",
          phone: "",
          notes: "",
          createdAt: now,
          updatedAt: now,
        };
        batch.create(ref, investor);
        batch.create(auditCollection.doc(), {
          entity: "investor",
          entityId: investorId,
          action: "import_create",
          before: null,
          after: investor,
          userId: actor.uid,
          timestamp: FieldValue.serverTimestamp(),
        });
        pendingWrites += 2;
      } else {
        const investorDoc = existing.docs.find((doc) => doc.id === investorId);
        if (investorDoc) investorName = String(investorDoc.get("name"));
      }

      for (const investment of [
        { type: "UNITS" as const, amount: row.units },
        { type: "STOCK_MARKET" as const, amount: row.stock },
      ]) {
        if (investment.amount === 0) continue;
        const transactionRef = db.collection("transactions").doc();
        const transaction = {
          challengeId: data.challengeId,
          investorId,
          investorName,
          type: investment.type,
          amount: investment.amount,
          date: challenge.endDate ?? now.slice(0, 10),
          institution: "",
          reference: "",
          proofUrl: "",
          proofPath: "",
          rawMessage: "",
          notes: "Imported from the challenge summary sheet",
          status: "verified",
          source: "import",
          createdBy: actor.uid,
          createdAt: now,
          updatedAt: now,
          verifiedBy: actor.uid,
          verifiedAt: now,
        };
        batch.create(transactionRef, transaction);
        batch.create(auditCollection.doc(), {
          entity: "transaction",
          entityId: transactionRef.id,
          action: "import",
          before: null,
          after: transaction,
          userId: actor.uid,
          timestamp: FieldValue.serverTimestamp(),
        });
        pendingWrites += 2;
      }
    }

    if (pendingWrites > 500) throw new Error("The sheet is too large to import in one atomic batch.");
    await batch.commit();
    for (const path of ["/dashboard", "/transactions", "/reports", "/investors"]) revalidatePath(path);
    return { ok: true, reconciliation };
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: error.message };
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? "Invalid import data." };
    }
    console.error("[import] action failed", error);
    return { ok: false, error: error instanceof Error ? error.message : "Could not import this sheet." };
  }
}
