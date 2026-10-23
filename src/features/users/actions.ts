"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { AuthorizationError, assertRole } from "@/lib/auth/dal";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import {
  createUserSchema,
  setDisabledSchema,
  updateRoleSchema,
  type CreateUserInput,
} from "@/lib/validators/auth";
import type { UserRole } from "@/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

function failure(err: unknown): ActionResult {
  if (err instanceof AuthorizationError) return { ok: false, error: err.message };
  if (err instanceof z.ZodError)
    return { ok: false, error: err.issues[0]?.message ?? "Invalid input" };
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = String((err as { code: unknown }).code);
    if (code === "auth/email-already-exists")
      return { ok: false, error: "A user with this email already exists" };
    if (code === "auth/user-not-found") return { ok: false, error: "User not found" };
  }
  console.error("[users] action failed", err);
  return { ok: false, error: "Something went wrong. Please try again." };
}

export async function createUserAction(input: CreateUserInput): Promise<ActionResult> {
  try {
    const actor = await assertRole("super_admin");
    const data = createUserSchema.parse(input);
    const auth = adminAuth();
    const record = await auth.createUser({
      email: data.email,
      password: data.password,
      displayName: data.name,
    });
    await auth.setCustomUserClaims(record.uid, { role: data.role });

    const now = new Date().toISOString();
    const profile = {
      uid: record.uid,
      name: data.name,
      email: data.email,
      role: data.role,
      disabled: false,
      createdAt: now,
      updatedAt: now,
    };
    await adminDb().collection("users").doc(record.uid).set(profile);
    await writeAuditLog({
      entity: "user",
      entityId: record.uid,
      action: "create",
      before: null,
      after: profile,
      userId: actor.uid,
    });
    revalidatePath("/settings");
    return { ok: true };
  } catch (err) {
    return failure(err);
  }
}

export async function updateUserRoleAction(uid: string, role: UserRole): Promise<ActionResult> {
  try {
    const actor = await assertRole("super_admin");
    const data = updateRoleSchema.parse({ uid, role });
    if (data.uid === actor.uid) throw new AuthorizationError("You cannot change your own role");

    const ref = adminDb().collection("users").doc(data.uid);
    const before = (await ref.get()).data() ?? null;
    const auth = adminAuth();
    const existing = await auth.getUser(data.uid);
    await auth.setCustomUserClaims(data.uid, { ...existing.customClaims, role: data.role });
    // Revoking forces the user to sign in again, so the new role takes effect immediately.
    await auth.revokeRefreshTokens(data.uid);

    const updatedAt = new Date().toISOString();
    await ref.set({ role: data.role, updatedAt }, { merge: true });
    await writeAuditLog({
      entity: "user",
      entityId: data.uid,
      action: "update_role",
      before: before ? { role: before.role } : null,
      after: { role: data.role },
      userId: actor.uid,
    });
    revalidatePath("/settings");
    return { ok: true };
  } catch (err) {
    return failure(err);
  }
}

export async function setUserDisabledAction(uid: string, disabled: boolean): Promise<ActionResult> {
  try {
    const actor = await assertRole("super_admin");
    const data = setDisabledSchema.parse({ uid, disabled });
    if (data.uid === actor.uid) throw new AuthorizationError("You cannot disable your own account");

    const auth = adminAuth();
    await auth.updateUser(data.uid, { disabled: data.disabled });
    if (data.disabled) await auth.revokeRefreshTokens(data.uid);

    const updatedAt = new Date().toISOString();
    await adminDb()
      .collection("users")
      .doc(data.uid)
      .set({ disabled: data.disabled, updatedAt }, { merge: true });
    await writeAuditLog({
      entity: "user",
      entityId: data.uid,
      action: data.disabled ? "disable" : "enable",
      before: { disabled: !data.disabled },
      after: { disabled: data.disabled },
      userId: actor.uid,
    });
    revalidatePath("/settings");
    return { ok: true };
  } catch (err) {
    return failure(err);
  }
}
