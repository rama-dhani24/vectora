"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const inviteEmailSchema = z.email().trim().toLowerCase();
const inviteIdSchema = z.string().uuid();

export type SettingsActionResult = { ok: true } | { ok: false; error: string };

function errorMessage(error: unknown): string {
  if (error instanceof z.ZodError) return "Enter a valid email address.";
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = String(error.message);
    if (message.toLowerCase().includes("already registered")) {
      return "This email already has a Vectora account. Ask them to sign in, or use a different email.";
    }
    if (message.includes("two admins")) return message;
    if (message.includes("invitation") || message.includes("Super Admin")) return message;
  }
  console.error("[settings] admin invitation failed", error);
  return "Could not complete this request. Please try again.";
}

export async function createAdminInviteAction(input: unknown): Promise<SettingsActionResult> {
  try {
    await assertRole("owner");
    const email = inviteEmailSchema.parse(input);
    const admin = createAdminClient();
    const supabase = await createClient();
    const { data: token, error } = await supabase.rpc("create_group_admin_invite", {
      target_email: email,
    });
    if (error) throw error;

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const redirectTo = new URL("/auth/callback?next=/set-password", siteUrl).toString();
    const { error: sendError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { admin_invite: String(token) },
      redirectTo,
    });
    if (sendError) throw sendError;

    revalidatePath("/settings");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function cancelAdminInviteAction(input: unknown): Promise<SettingsActionResult> {
  try {
    await assertRole("owner");
    const inviteId = inviteIdSchema.parse(input);
    const supabase = await createClient();
    const { data: canceled, error } = await supabase.rpc("cancel_group_admin_invite", {
      target_invite_id: inviteId,
    });
    if (error) throw error;
    if (!canceled) return { ok: false, error: "Invitation not found or already used." };
    revalidatePath("/settings");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}
