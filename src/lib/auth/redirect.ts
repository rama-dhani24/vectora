/** Only allows same-origin relative paths, preventing open redirects via ?next=. */
export function safeNextPath(next: string | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  if (next === "/login" || next.startsWith("/login?")) return fallback;
  return next;
}
