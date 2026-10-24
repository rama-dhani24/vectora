"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AuthorizationError, assertRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { challengeSchema } from "@/lib/validators/challenges";
import { investorSchema } from "@/lib/validators/investors";
import { transactionSchema } from "@/lib/validators/transactions";
import { mapTransaction } from "@/lib/supabase/mappers";

export type DataActionResult =
  { ok: true; id?: string; duplicate?: boolean } | { ok: false; error: string };

const idSchema = z.string().uuid();

function getErrorMessage(error: unknown): string {
  if (error instanceof AuthorizationError) return error.message;
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "Invalid input";
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = String(error.code);
    if (code === "23505") return "A record with the same unique value already exists.";
  }
  console.error("[data] action failed", error);
  return "Something went wrong. Please try again.";
}

function revalidateData(): void {
  for (const path of ["/dashboard", "/challenges", "/investors", "/transactions", "/reports"]) {
    revalidatePath(path);
  }
}

async function writeAudit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  actor: Awaited<ReturnType<typeof assertRole>>,
  entity: "investor" | "challenge" | "transaction",
  entityId: string,
  action: string,
  before: unknown,
  after: unknown,
) {
  const { error } = await supabase.from("audit_logs").insert({
    group_id: actor.groupId,
    entity,
    entity_id: entityId,
    action,
    before,
    after,
    user_id: actor.uid,
  });
  if (error) throw error;
}

export async function saveInvestorAction(
  id: string | null,
  input: unknown,
): Promise<DataActionResult> {
  try {
    const actor = await assertRole("admin");
    const data = investorSchema.parse(input);
    const supabase = await createClient();
    const values = {
      group_id: actor.groupId,
      name: data.name,
      name_lower: data.name.toLocaleLowerCase("en"),
      phone: data.phone,
      notes: data.notes,
      status: data.status,
      updated_at: new Date().toISOString(),
    };
    let before: unknown = null;
    if (id) {
      const investorId = idSchema.parse(id);
      const old = await supabase
        .from("investors")
        .select("*")
        .eq("group_id", actor.groupId)
        .eq("id", investorId)
        .maybeSingle();
      if (!old.data) return { ok: false, error: "Investor not found." };
      before = old.data;
      const { error } = await supabase
        .from("investors")
        .update(values)
        .eq("group_id", actor.groupId)
        .eq("id", investorId);
      if (error) throw error;
      await writeAudit(supabase, actor, "investor", investorId, "update", before, values);
      revalidateData();
      return { ok: true, id: investorId };
    }
    const { data: created, error } = await supabase
      .from("investors")
      .insert(values)
      .select("id")
      .single();
    if (error) throw error;
    await writeAudit(supabase, actor, "investor", created.id, "create", before, values);
    revalidateData();
    return { ok: true, id: created.id };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error) };
  }
}

export async function deleteInvestorAction(id: string): Promise<DataActionResult> {
  try {
    const actor = await assertRole("admin");
    const investorId = idSchema.parse(id);
    const supabase = await createClient();
    const old = await supabase
      .from("investors")
      .select("*")
      .eq("group_id", actor.groupId)
      .eq("id", investorId)
      .maybeSingle();
    if (!old.data) return { ok: false, error: "Investor not found." };
    const linked = await supabase
      .from("transactions")
      .select("id")
      .eq("group_id", actor.groupId)
      .eq("investor_id", investorId)
      .limit(1);
    if (linked.data?.length)
      return { ok: false, error: "This investor has transactions. Mark them inactive instead." };
    const { error } = await supabase
      .from("investors")
      .delete()
      .eq("group_id", actor.groupId)
      .eq("id", investorId);
    if (error) throw error;
    await writeAudit(supabase, actor, "investor", investorId, "delete", old.data, null);
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
    const supabase = await createClient();
    const existing = await supabase
      .from("investors")
      .select("name_lower")
      .eq("group_id", actor.groupId);
    const names = new Set((existing.data ?? []).map((row) => row.name_lower));
    const batchNames = new Set<string>();
    const normalized = rows.map((row) => {
      const nameLower = row.name.toLocaleLowerCase("en");
      if (names.has(nameLower) || batchNames.has(nameLower))
        throw new Error(`Duplicate investor: ${row.name}`);
      batchNames.add(nameLower);
      return {
        group_id: actor.groupId,
        name: row.name,
        name_lower: nameLower,
        phone: row.phone,
        notes: row.notes,
        status: row.status,
      };
    });
    const { data, error } = await supabase
      .from("investors")
      .insert(normalized)
      .select("id,name,name_lower,phone,notes,status");
    if (error) throw error;
    const { error: auditError } = await supabase.from("audit_logs").insert(
      (data ?? []).map((row) => ({
        group_id: actor.groupId,
        entity: "investor",
        entity_id: row.id,
        action: "bulk_import",
        before: null,
        after: row,
        user_id: actor.uid,
      })),
    );
    if (auditError) throw auditError;
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
    const supabase = await createClient();
    let before: Record<string, unknown> | null = null;
    if (id) {
      const challengeId = idSchema.parse(id);
      const old = await supabase
        .from("challenges")
        .select("*")
        .eq("group_id", actor.groupId)
        .eq("id", challengeId)
        .maybeSingle();
      if (!old.data) return { ok: false, error: "Challenge not found." };
      before = old.data;
      if (old.data.status === "closed")
        return {
          ok: false,
          error: "Closed challenges are locked. Ask the Super Admin to reopen this challenge.",
        };
      const { error } = await supabase
        .from("challenges")
        .update({
          title: data.title,
          month: data.month,
          year: data.year,
          start_date: data.startDate,
          end_date: data.endDate,
          status: data.status,
        })
        .eq("group_id", actor.groupId)
        .eq("id", challengeId);
      if (error) throw error;
      await writeAudit(supabase, actor, "challenge", challengeId, "update", before, data);
      revalidateData();
      return { ok: true, id: challengeId };
    }
    if (data.status === "closed")
      return { ok: false, error: "Create the challenge before closing it." };
    const { data: created, error } = await supabase
      .from("challenges")
      .insert({
        group_id: actor.groupId,
        title: data.title,
        month: data.month,
        year: data.year,
        start_date: data.startDate,
        end_date: data.endDate,
        status: data.status,
      })
      .select("id")
      .single();
    if (error) throw error;
    await writeAudit(supabase, actor, "challenge", created.id, "create", null, data);
    revalidateData();
    return { ok: true, id: created.id };
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
    const challengeId = idSchema.parse(id);
    const parsedStatus = z.enum(["open", "closed"]).parse(status);
    const supabase = await createClient();
    const old = await supabase
      .from("challenges")
      .select("status")
      .eq("group_id", actor.groupId)
      .eq("id", challengeId)
      .maybeSingle();
    if (!old.data) return { ok: false, error: "Challenge not found." };
    if (old.data.status === "closed" && parsedStatus === "open" && actor.role !== "owner") {
      return { ok: false, error: "Only the Super Admin can reopen a closed challenge." };
    }
    const { error } = await supabase
      .from("challenges")
      .update({ status: parsedStatus })
      .eq("group_id", actor.groupId)
      .eq("id", challengeId);
    if (error) throw error;
    await writeAudit(supabase, actor, "challenge", challengeId, parsedStatus, old.data, {
      status: parsedStatus,
    });
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
    const transactionId = id ? idSchema.parse(id) : null;
    const supabase = await createClient();
    const [challengeResult, investorResult, oldResult, duplicateResult, referenceResult] =
      await Promise.all([
        supabase
          .from("challenges")
          .select("id,status,end_date")
          .eq("group_id", actor.groupId)
          .eq("id", data.challengeId)
          .maybeSingle(),
        supabase
          .from("investors")
          .select("id,name,status")
          .eq("group_id", actor.groupId)
          .eq("id", data.investorId)
          .maybeSingle(),
        transactionId
          ? supabase
              .from("transactions")
              .select("*")
              .eq("group_id", actor.groupId)
              .eq("id", transactionId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase
          .from("transactions")
          .select("id,amount,type,date")
          .eq("group_id", actor.groupId)
          .eq("investor_id", data.investorId),
        data.reference
          ? supabase
              .from("transactions")
              .select("id")
              .eq("group_id", actor.groupId)
              .eq("reference", data.reference)
          : Promise.resolve({ data: [], error: null }),
      ]);
    const challenge = challengeResult.data;
    const investor = investorResult.data;
    const old = oldResult.data as {
      challenge_id: string;
      status: string;
      source: string;
      created_by: string;
      verified_by: string | null;
      verified_at: string | null;
    } | null;
    if (!challenge) return { ok: false, error: "Challenge not found." };
    if (challenge.status !== "open")
      return { ok: false, error: "Transactions can only be added to an open challenge." };
    if (!investor || investor.status !== "active")
      return { ok: false, error: "Choose an active investor." };
    if (transactionId && !old) return { ok: false, error: "Transaction not found." };
    if (old?.challenge_id !== data.challengeId && old?.challenge_id) {
      const prior = await supabase
        .from("challenges")
        .select("status")
        .eq("group_id", actor.groupId)
        .eq("id", old.challenge_id)
        .maybeSingle();
      if (prior.data?.status !== "open")
        return { ok: false, error: "Transactions in closed challenges cannot be edited." };
    }
    const duplicate = (duplicateResult.data ?? []).some(
      (row) =>
        row.id !== transactionId &&
        row.amount === data.amount &&
        row.type === data.type &&
        row.date === data.date,
    );
    const referenceDuplicate = (referenceResult.data ?? []).some((row) => row.id !== transactionId);
    if ((duplicate || referenceDuplicate) && !data.allowDuplicate)
      return { ok: true, duplicate: true };
    const values = {
      group_id: actor.groupId,
      challenge_id: data.challengeId,
      investor_id: data.investorId,
      investor_name: investor.name,
      type: data.type,
      amount: data.amount,
      date: data.date,
      institution: data.institution,
      reference: data.reference,
      proof_url: "",
      proof_path: data.proofPath,
      raw_message: data.rawMessage,
      notes: data.notes,
      status: old?.status ?? "pending",
      source: old?.source ?? "manual",
      created_by: old?.created_by ?? actor.uid,
      verified_by: old?.verified_by ?? null,
      verified_at: old?.verified_at ?? null,
    };
    const result = transactionId
      ? await supabase
          .from("transactions")
          .update(values)
          .eq("group_id", actor.groupId)
          .eq("id", transactionId)
          .select("id")
          .single()
      : await supabase.from("transactions").insert(values).select("id").single();
    if (result.error) throw result.error;
    const transactionResult = await supabase
      .from("transactions")
      .select("*")
      .eq("group_id", actor.groupId)
      .eq("id", result.data.id)
      .single();
    const transaction = transactionResult.data ? mapTransaction(transactionResult.data) : values;
    await writeAudit(
      supabase,
      actor,
      "transaction",
      result.data.id,
      transactionId ? "update" : "create",
      old,
      transaction,
    );
    revalidateData();
    return { ok: true, id: result.data.id };
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
    const transactionId = idSchema.parse(id);
    const parsedStatus = z.enum(["verified", "rejected"]).parse(status);
    const supabase = await createClient();
    const old = await supabase
      .from("transactions")
      .select("*")
      .eq("group_id", actor.groupId)
      .eq("id", transactionId)
      .maybeSingle();
    if (!old.data) return { ok: false, error: "Transaction not found." };
    const challenge = await supabase
      .from("challenges")
      .select("status")
      .eq("group_id", actor.groupId)
      .eq("id", old.data.challenge_id)
      .maybeSingle();
    if (challenge.data?.status !== "open")
      return { ok: false, error: "Transactions in closed challenges are locked." };
    const values = {
      status: parsedStatus,
      ...(parsedStatus === "verified"
        ? { verified_by: actor.uid, verified_at: new Date().toISOString() }
        : {}),
    };
    const { error } = await supabase
      .from("transactions")
      .update(values)
      .eq("group_id", actor.groupId)
      .eq("id", transactionId);
    if (error) throw error;
    await writeAudit(supabase, actor, "transaction", transactionId, parsedStatus, old.data, values);
    revalidateData();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error) };
  }
}

export async function deleteTransactionAction(id: string): Promise<DataActionResult> {
  try {
    const actor = await assertRole("admin");
    const transactionId = idSchema.parse(id);
    const supabase = await createClient();
    const old = await supabase
      .from("transactions")
      .select("*")
      .eq("group_id", actor.groupId)
      .eq("id", transactionId)
      .maybeSingle();
    if (!old.data) return { ok: false, error: "Transaction not found." };
    const challenge = await supabase
      .from("challenges")
      .select("status")
      .eq("group_id", actor.groupId)
      .eq("id", old.data.challenge_id)
      .maybeSingle();
    if (challenge.data?.status !== "open")
      return { ok: false, error: "Transactions in closed challenges are locked." };
    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("group_id", actor.groupId)
      .eq("id", transactionId);
    if (error) throw error;
    await writeAudit(supabase, actor, "transaction", transactionId, "delete", old.data, null);
    revalidateData();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error) };
  }
}
