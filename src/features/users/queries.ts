import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { assertRole } from "@/lib/auth/dal";
import { isUserRole } from "@/lib/auth/roles";
import type { UserProfile } from "@/types";

function toProfile(id: string, data: FirebaseFirestore.DocumentData): UserProfile | null {
  if (!isUserRole(data.role)) return null;
  return {
    uid: id,
    name: typeof data.name === "string" ? data.name : "",
    email: typeof data.email === "string" ? data.email : "",
    role: data.role,
    disabled: data.disabled === true,
    createdAt: typeof data.createdAt === "string" ? data.createdAt : "",
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : "",
  };
}

/** Super Admin only: all Vectora users, newest first. */
export async function listUsers(): Promise<UserProfile[]> {
  await assertRole("super_admin");
  const snap = await adminDb().collection("users").orderBy("createdAt", "desc").get();
  return snap.docs.flatMap((doc) => {
    const profile = toProfile(doc.id, doc.data());
    return profile ? [profile] : [];
  });
}
