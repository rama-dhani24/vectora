import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * Optimistic check only: sends visitors without a session cookie to /login.
 * The cookie is cryptographically verified in the Data Access Layer (src/lib/auth/dal.ts)
 * on every page, server action and route handler.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)",
  ],
};
