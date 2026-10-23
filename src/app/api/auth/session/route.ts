import { NextResponse, type NextRequest } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { isUserRole } from "@/lib/auth/roles";
import { sessionRequestSchema } from "@/lib/validators/auth";

const MAX_SIGN_IN_AGE_SECONDS = 5 * 60;

function sessionMaxAgeMs(): number {
  const days = Number(process.env.SESSION_EXPIRES_DAYS ?? "5");
  const safeDays = Number.isFinite(days) ? Math.min(Math.max(days, 1), 14) : 5;
  return safeDays * 24 * 60 * 60 * 1000;
}

type SessionError = "invalid_request" | "invalid_token" | "stale_login" | "no_role" | "disabled";

function error(code: SessionError, status: number) {
  return NextResponse.json({ error: code }, { status });
}

/** Exchanges a fresh Firebase ID token for an httpOnly session cookie. */
export async function POST(request: NextRequest) {
  const parsed = sessionRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return error("invalid_request", 400);

  const auth = adminAuth();
  let decoded;
  try {
    decoded = await auth.verifyIdToken(parsed.data.idToken, true);
  } catch {
    return error("invalid_token", 401);
  }

  if (Date.now() / 1000 - decoded.auth_time > MAX_SIGN_IN_AGE_SECONDS) {
    return error("stale_login", 401);
  }

  const user = await auth.getUser(decoded.uid);
  if (user.disabled) return error("disabled", 403);
  if (!isUserRole(decoded.role)) return error("no_role", 403);

  const expiresIn = sessionMaxAgeMs();
  const sessionCookie = await auth.createSessionCookie(parsed.data.idToken, { expiresIn });

  const response = NextResponse.json({ role: decoded.role });
  response.cookies.set(SESSION_COOKIE, sessionCookie, {
    maxAge: expiresIn / 1000,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
  return response;
}

/** Signs out: clears the cookie and revokes refresh tokens so other devices are logged out too. */
export async function DELETE(request: NextRequest) {
  const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value;
  if (sessionCookie) {
    try {
      const decoded = await adminAuth().verifySessionCookie(sessionCookie);
      await adminAuth().revokeRefreshTokens(decoded.sub);
    } catch {
      // Expired or invalid cookie: clearing it is enough.
    }
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
