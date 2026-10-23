import { USER_ROLES, type UserRole } from "@/types";

const RANK: Record<UserRole, number> = {
  viewer: 1,
  admin: 2,
  super_admin: 3,
};

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && (USER_ROLES as readonly string[]).includes(value);
}

/** True when `role` is at least as privileged as `required`. */
export function hasRole(role: UserRole | null | undefined, required: UserRole): boolean {
  if (!role) return false;
  return RANK[role] >= RANK[required];
}

export const can = {
  manageUsers: (role: UserRole | null | undefined) => hasRole(role, "super_admin"),
  reopenChallenge: (role: UserRole | null | undefined) => hasRole(role, "super_admin"),
  writeData: (role: UserRole | null | undefined) => hasRole(role, "admin"),
  readReports: (role: UserRole | null | undefined) => hasRole(role, "viewer"),
};

export type NavKey =
  "dashboard" | "challenges" | "transactions" | "investors" | "reports" | "import" | "settings";

export interface NavItem {
  key: NavKey;
  href: `/${string}`;
  minRole: UserRole;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { key: "dashboard", href: "/dashboard", minRole: "viewer" },
  { key: "challenges", href: "/challenges", minRole: "admin" },
  { key: "transactions", href: "/transactions", minRole: "admin" },
  { key: "investors", href: "/investors", minRole: "admin" },
  { key: "reports", href: "/reports", minRole: "viewer" },
  { key: "import", href: "/import", minRole: "admin" },
  { key: "settings", href: "/settings", minRole: "viewer" },
];

export function navItemsFor(role: UserRole): NavItem[] {
  return NAV_ITEMS.filter((item) => hasRole(role, item.minRole));
}
