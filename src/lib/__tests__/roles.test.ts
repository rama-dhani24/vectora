import { describe, expect, it } from "vitest";
import { can, hasRole, isUserRole, navItemsFor } from "@/lib/auth/roles";

describe("roles", () => {
  it("orders roles by privilege", () => {
    expect(hasRole("super_admin", "admin")).toBe(true);
    expect(hasRole("admin", "super_admin")).toBe(false);
    expect(hasRole("viewer", "viewer")).toBe(true);
    expect(hasRole(null, "viewer")).toBe(false);
  });

  it("limits sensitive actions to super admins", () => {
    expect(can.manageUsers("super_admin")).toBe(true);
    expect(can.manageUsers("admin")).toBe(false);
    expect(can.reopenChallenge("admin")).toBe(false);
    expect(can.writeData("viewer")).toBe(false);
    expect(can.writeData("admin")).toBe(true);
  });

  it("validates role strings from untrusted input", () => {
    expect(isUserRole("admin")).toBe(true);
    expect(isUserRole("owner")).toBe(false);
    expect(isUserRole(undefined)).toBe(false);
  });

  it("hides write modules from viewers", () => {
    const keys = navItemsFor("viewer").map((item) => item.key);
    expect(keys).toEqual(["dashboard", "reports", "settings"]);
    expect(navItemsFor("admin")).toHaveLength(7);
  });
});
