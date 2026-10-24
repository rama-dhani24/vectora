import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { hasRole, isUserRole } from "@/lib/auth/roles";
import type { SessionUser, UserRole } from "@/types";

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const authUser = authData.user;
  if (authError || !authUser) return null;

  const { data: membership, error } = await supabase
    .from("group_memberships")
    .select("role, group_id, groups(name)")
    .eq("user_id", authUser.id)
    .eq("status", "active")
    .maybeSingle();
  if (error || !membership || !isUserRole(membership.role)) return null;
  const group = Array.isArray(membership.groups) ? membership.groups[0] : membership.groups;
  if (!group?.name) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", authUser.id)
    .maybeSingle();
  const email = authUser.email ?? "";
  return {
    uid: authUser.id,
    name: profile?.full_name || authUser.user_metadata.full_name || email,
    email,
    role: membership.role,
    groupId: membership.group_id,
    groupName: group.name,
  };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(required: UserRole): Promise<SessionUser> {
  const user = await requireUser();
  if (!hasRole(user.role, required)) redirect("/dashboard");
  return user;
}

export class AuthorizationError extends Error {
  constructor(message = "You are not allowed to perform this action") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export async function assertRole(required: UserRole): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user || !hasRole(user.role, required)) throw new AuthorizationError();
  return user;
}
