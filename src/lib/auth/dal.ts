import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { adminAuth } from "@/lib/firebase/admin";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { hasRole, isUserRole } from "@/lib/auth/roles";
import type { SessionUser, UserRole } from "@/types";

/**
 * Data Access Layer: the only place that turns the session cookie into a user.
 * The role comes from the verified custom claim, never from client input.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const sessionCookie = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!sessionCookie) return null;

  try {
    const decoded = await adminAuth().verifySessionCookie(sessionCookie, true);
    const role: unknown = decoded.role;
    if (!isUserRole(role)) return null;
    const email = decoded.email ?? "";
    const name = typeof decoded.name === "string" && decoded.name ? decoded.name : email;
    return { uid: decoded.uid, email, name, role };
  } catch {
    return null;
  }
});

/** For pages and layouts: redirects to /login when there is no valid session. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** For pages: redirects users without the required role back to the dashboard. */
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

/** For server actions and route handlers: throws instead of redirecting. */
export async function assertRole(required: UserRole): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user || !hasRole(user.role, required)) throw new AuthorizationError();
  return user;
}
