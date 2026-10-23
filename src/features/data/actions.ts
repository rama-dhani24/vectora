"use server";

import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AuthorizationError, assertRole } from "@/lib/auth/dal";
import { adminDb } from "@/lib/firebase/admin";
import { challengeSchema } from "@/lib/validators/challenges";
import { investorSchema } from "@/lib/validators/investors";
import { transactionSchema } from "@/lib/validators/transactions";
import type { Challenge, Transaction } from "@/types";

export type DataActionResult =
  | { ok: true; id?: string; duplicate?: boolean }
  | { ok: false; error: string };

const idSchema = z.string().min(1).max(128);

function getErrorMessage(error: unknown): string {
  if (error instanceof AuthorizationError) return error.message;
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "Invalid input";
  console.error("[data] action failed", error);
  return "Something went wrong. Please try again.";
}

function revalidateData(): void {
  for (const path of ["/dashboard", "/challenges", "/investors", "/transactions", "/reports"]) {
    revalidatePath(path);
  }
}

function auditEntry(
  entity: "investor" | "challenge" | "transaction",
  entityId: string,
  action: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  userId: string,
) {
  return {
    entity,
    entityId,
    action,
    before,
    after,
    userId,
    timestamp: FieldValue.serverTimestamp(),
  };
}

export async function saveInvestorAction(
  id: string | null,
  input: unknown,
): Promise<DataActionResult> {
  try {
    const actor = await assertRole("admin");
    const data = investorSchema.parse(input);
    const db = adminDb();
    const nameLower = data.name.toLocaleLowerCase("en");
    const ref = id
      ? db.collection("investors").doc(idSchema.parse(id))
      : db.collection("investors").doc();
    const auditRef = db.collection("auditLogs").doc();
    const now = new Date().toISOString();
    const result = await db.runTransaction(async (transaction) => {
      const old = id ? await transaction.get(ref) : null;
      const duplicates = await transaction.get(
        db.collection("investors").where("nameLower", "==", nameLower),
      );
      if (old && !old.exists) return { error: "Investor not found." as const };
      if (duplicates.docs.some((doc) => doc.id !== id)) {
        return { error: "An investor with this name already exists." as const };
      }
      const record = {
        name: data.name,
        nameLower,
        phone: data.phone,
        notes: data.notes,
        status: data.status,
        ...(old ? { updatedAt: now } : { createdAt: now, updatedAt: now }),
      };
      transaction.set(ref, record, { merge: Boolean(old) });
      transaction.create(
        auditRef,
        auditEntry("investor", ref.id, old ? "update" : "create", old?.data() ?? null, record, actor.uid),
      );
      return { error: null };
    });
    if (result.error) return { ok: false, error: result.error };
    revalidateData();
    return { ok: true, id: ref.id };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error) };
  }
}

export async function deleteInvestorAction(id: string): Promise<DataActionResult> {
  try {
    const actor = await assertRole("admin");
    const investorId = idSchema.parse(id);
    const db = adminDb();
    const ref = db.collection("investors").doc(investorId);
    const auditRef = db.collection("auditLogs").doc();
    const result = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      const linkedTransactions = await transaction.get(
        db.collection("transactions").where("investorId", "==", investorId).limit(1),
      );
      if (!snap.exists) return { error: "Investor not found." as const };
      if (!linkedTransactions.empty) {
        return { error: "This investor has transactions. Mark them inactive instead." as const };
      }
      transaction.delete(ref);
      transaction.create(
        auditRef,
        auditEntry("investor", investorId, "delete", snap.data() ?? null, null, actor.uid),
      );
      return { error: null };
    });
    if (result.error) return { ok: false, error: result.error };
    revalidateData();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error) };
  }
}

export async function bulkCreateInvestorsAction(input: unknown): Promise<DataActionResult> {
  try {
    const actor = await assertRole("admin");
    const rows = z.array(investorSchema).min(1).max(250).parse(input);
    const db = adminDb();
    const existing = await db.collection("investors").get();
    const names = new Set(existing.docs.map((doc) => String(doc.get("nameLower") ?? "")));
    const repeated = new Set<string>();
    const normalized = rows.map((row) => {
      const nameLower = row.name.toLocaleLowerCase("en");
      if (names.has(nameLower) || repeated.has(nameLower)) throw new Error(`Duplicate investor: ${row.name}`);
      repeated.add(nameLower);
      return { ...row, nameLower };
    });
    const batch = db.batch();
    const now = new Date().toISOString();
    for (const row of normalized) {
      const ref = db.collection("investors").doc();
      const record = { ...row, createdAt: now, updatedAt: now };
      batch.set(ref, record);
      batch.create(db.collection("auditLogs").doc(), {
        entity: "investor",
        entityId: ref.id,
        action: "bulk_import",
        before: null,
        after: record,
        userId: actor.uid,
        timestamp: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
    revalidateData();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error) };
  }
}

export async function saveChallengeAction(
  id: string | null,
  input: unknown,
): Promise<DataActionResult> {
  try {
    const actor = await assertRole("admin");
    const data = challengeSchema.parse(input);
    const db = adminDb();
    const ref = id
      ? db.collection("challenges").doc(idSchema.parse(id))
      : db.collection("challenges").doc();
    const openChallengeRef = db.collection("system").doc("openChallenge");
    const auditRef = db.collection("auditLogs").doc();
    const now = new Date().toISOString();
    const transactionResult = await db.runTransaction(async (transaction) => {
      const old = id ? await transaction.get(ref) : null;
      const openLock = await transaction.get(openChallengeRef);
      const oldChallenge = old?.data() as Partial<Challenge> | undefined;
      if (old && !old.exists) return { error: "Challenge not found." as const };
      if (oldChallenge?.status === "closed") {
        return { error: "Closed challenges are locked. Reopen them as a Super Admin first." as const };
      }
      if (data.status === "closed" && !old) {
        return { error: "Create the challenge before closing it." as const };
      }
      const openChallenges =
        data.status === "open"
          ? await transaction.get(db.collection("challenges").where("status", "==", "open"))
          : null;
      const lockedId = openLock.get("challengeId");
      if (
        data.status === "open" &&
        ((typeof lockedId === "string" && lockedId !== ref.id) ||
          openChallenges?.docs.some((doc) => doc.id !== ref.id))
      ) {
        return { error: "Close the current open challenge before opening another." as const };
      }
      const record = {
        title: data.title,
        month: data.month,
        year: data.year,
        startDate: data.startDate,
        endDate: data.endDate,
        status: data.status,
        totals: oldChallenge?.totals ?? { units: 0, stock: 0, final: 0, participants: 0 },
        ...(old ? { updatedAt: now } : { createdAt: now, updatedAt: now }),
      };
      transaction.set(ref, record, { merge: Boolean(old) });
      if (data.status === "open") transaction.set(openChallengeRef, { challengeId: ref.id });
      else if (lockedId === ref.id) transaction.delete(openChallengeRef);
      transaction.create(
        auditRef,
        auditEntry(
          "challenge",
          ref.id,
          old ? "update" : "create",
          old?.data() ?? null,
          record,
          actor.uid,
        ),
      );
      return { error: null, before: old?.data() ?? null, record };
    });
    if (transactionResult.error) return { ok: false, error: transactionResult.error };
    revalidateData();
    return { ok: true, id: ref.id };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error) };
  }
}

export async function setChallengeStatusAction(
  id: string,
  status: "open" | "closed",
): Promise<DataActionResult> {
  try {
    const actor = await assertRole("admin");
    const parsedStatus = z.enum(["open", "closed"]).parse(status);
    const challengeId = idSchema.parse(id);
    const db = adminDb();
    const ref = db.collection("challenges").doc(challengeId);
    const openChallengeRef = db.collection("system").doc("openChallenge");
    const auditRef = db.collection("auditLogs").doc();
    const updatedAt = new Date().toISOString();
    const result = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      const openLock = await transaction.get(openChallengeRef);
      if (!snap.exists) return { error: "Challenge not found." as const };
      const before = snap.data() as Record<string, unknown>;
      if (before.status === "closed" && parsedStatus === "open" && actor.role !== "super_admin") {
        return { error: "Only a Super Admin can reopen a closed challenge." as const };
      }
      const openChallenges =
        parsedStatus === "open"
          ? await transaction.get(db.collection("challenges").where("status", "==", "open"))
          : null;
      const lockedId = openLock.get("challengeId");
      if (
        parsedStatus === "open" &&
        ((typeof lockedId === "string" && lockedId !== challengeId) ||
          openChallenges?.docs.some((doc) => doc.id !== challengeId))
      ) {
        return { error: "Close the current open challenge before opening another." as const };
      }
      transaction.update(ref, { status: parsedStatus, updatedAt });
      if (parsedStatus === "open") transaction.set(openChallengeRef, { challengeId });
      else if (lockedId === challengeId) transaction.delete(openChallengeRef);
      transaction.create(
        auditRef,
        auditEntry(
          "challenge",
          challengeId,
          parsedStatus === "open" && before.status === "closed" ? "reopen" : parsedStatus,
          { status: before.status },
          { status: parsedStatus },
          actor.uid,
        ),
      );
      return { error: null, before };
    });
    if (result.error) return { ok: false, error: result.error };
    revalidateData();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error) };
  }
}

export async function saveTransactionAction(
  id: string | null,
  input: unknown,
): Promise<DataActionResult> {
  try {
    const actor = await assertRole("admin");
    const data = transactionSchema.parse(input);
    const db = adminDb();
    const challengeRef = db.collection("challenges").doc(data.challengeId);
    const ref = id ? db.collection("transactions").doc(idSchema.parse(id)) : db.collection("transactions").doc();
    const investorRef = db.collection("investors").doc(data.investorId);
    const auditRef = db.collection("auditLogs").doc();
    const now = new Date().toISOString();
    const result = await db.runTransaction(async (transaction) => {
      const [challengeSnap, investorSnap, old, duplicateDocs, referenceDocs] = await Promise.all([
        transaction.get(challengeRef),
        transaction.get(investorRef),
        id ? transaction.get(ref) : Promise.resolve(null),
        transaction.get(
          db.collection("transactions").where("investorId", "==", data.investorId),
        ),
        data.reference
          ? transaction.get(
              db.collection("transactions").where("reference", "==", data.reference),
            )
          : Promise.resolve(null),
      ]);
      if (!challengeSnap.exists) return { kind: "error" as const, error: "Challenge not found." };
      if (challengeSnap.get("status") !== "open") {
        return {
          kind: "error" as const,
          error: "Transactions can only be added to an open challenge.",
        };
      }
      if (!investorSnap.exists || investorSnap.get("status") !== "active") {
        return { kind: "error" as const, error: "Choose an active investor." };
      }
      const investorName = investorSnap.get("name");
      if (typeof investorName !== "string") {
        return { kind: "error" as const, error: "Choose an active investor." };
      }
      if (old && !old.exists) {
        return { kind: "error" as const, error: "Transaction not found." };
      }
      const previous = old?.data() as Partial<Transaction> | undefined;
      if (previous?.challengeId && previous.challengeId !== data.challengeId) {
        const priorChallenge = await transaction.get(
          db.collection("challenges").doc(previous.challengeId),
        );
        if (priorChallenge.get("status") !== "open") {
          return {
            kind: "error" as const,
            error: "Transactions in closed challenges cannot be edited.",
          };
        }
      }
      const duplicate = duplicateDocs.docs.some((doc) => {
        if (doc.id === id) return false;
        const item = doc.data();
        return item.amount === data.amount && item.type === data.type && item.date === data.date;
      });
      const referenceDuplicate = referenceDocs?.docs.some((doc) => doc.id !== id) ?? false;
      if ((duplicate || referenceDuplicate) && !data.allowDuplicate) {
        return { kind: "duplicate" as const };
      }
      const record = {
        challengeId: data.challengeId,
        investorId: data.investorId,
        investorName,
        type: data.type,
        amount: data.amount,
        date: data.date,
        institution: data.institution,
        reference: data.reference,
        proofUrl: data.proofUrl,
        proofPath: data.proofPath,
        rawMessage: data.rawMessage,
        notes: data.notes,
        status: old ? previous?.status ?? "pending" : "pending",
        source: previous?.source ?? "manual",
        createdBy: previous?.createdBy ?? actor.uid,
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
        ...(previous?.verifiedBy ? { verifiedBy: previous.verifiedBy } : {}),
        ...(previous?.verifiedAt ? { verifiedAt: previous.verifiedAt } : {}),
      };
      transaction.set(ref, record);
      transaction.create(
        auditRef,
        auditEntry(
          "transaction",
          ref.id,
          old ? "update" : "create",
          old?.data() ?? null,
          record,
          actor.uid,
        ),
      );
      return { kind: "success" as const, id: ref.id };
    });
    if (result.kind === "error") return { ok: false, error: result.error };
    if (result.kind === "duplicate") return { ok: true, duplicate: true };
    revalidateData();
    return { ok: true, id: result.id };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error) };
  }
}

export async function setTransactionStatusAction(
  id: string,
  status: "verified" | "rejected",
): Promise<DataActionResult> {
  try {
    const actor = await assertRole("admin");
    const parsedStatus = z.enum(["verified", "rejected"]).parse(status);
    const txId = idSchema.parse(id);
    const db = adminDb();
    const ref = db.collection("transactions").doc(txId);
    const now = new Date().toISOString();
    const auditRef = db.collection("auditLogs").doc();
    const result = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists) return { error: "Transaction not found." as const };
      const before = snap.data() as Record<string, unknown>;
      const challenge = await transaction.get(
        db.collection("challenges").doc(String(before.challengeId ?? "")),
      );
      if (!challenge.exists || challenge.get("status") !== "open") {
        return { error: "Transactions in closed challenges are locked." as const };
      }
      const after = {
        status: parsedStatus,
        updatedAt: now,
        ...(parsedStatus === "verified" ? { verifiedBy: actor.uid, verifiedAt: now } : {}),
      };
      transaction.update(ref, after);
      transaction.create(
        auditRef,
        auditEntry(
          "transaction",
          txId,
          parsedStatus,
          { status: before.status },
          { status },
          actor.uid,
        ),
      );
      return { error: null };
    });
    if (result.error) return { ok: false, error: result.error };
    revalidateData();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error) };
  }
}

export async function deleteTransactionAction(id: string): Promise<DataActionResult> {
  try {
    const actor = await assertRole("admin");
    const txId = idSchema.parse(id);
    const db = adminDb();
    const ref = db.collection("transactions").doc(txId);
    const auditRef = db.collection("auditLogs").doc();
    const result = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists) return { error: "Transaction not found." as const };
      const before = snap.data() as Record<string, unknown>;
      const challenge = await transaction.get(
        db.collection("challenges").doc(String(before.challengeId ?? "")),
      );
      if (!challenge.exists || challenge.get("status") !== "open") {
        return { error: "Transactions in closed challenges are locked." as const };
      }
      transaction.delete(ref);
      transaction.create(
        auditRef,
        auditEntry("transaction", txId, "delete", before, null, actor.uid),
      );
      return { error: null };
    });
    if (result.error) return { ok: false, error: result.error };
    revalidateData();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error) };
  }
}
