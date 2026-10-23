/**
 * Creates (or promotes) a Super Admin. This is the only way to bootstrap the first account.
 *
 *   npm run seed:admin -- --email you@example.com --password 'StrongPass123' --name "Your Name"
 *
 * Uses the emulators when NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true in .env.local; otherwise it
 * targets the real project with the service account from FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY
 * (or Application Default Credentials).
 */
import { parseArgs } from "node:util";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "../src/lib/firebase/admin-init";
import { createUserSchema } from "../src/lib/validators/auth";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      password: { type: "string" },
      name: { type: "string", default: "Super Admin" },
    },
  });

  const input = createUserSchema.parse({
    email: values.email,
    password: values.password,
    name: values.name,
    role: "super_admin",
  });

  const target =
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true"
      ? "Firebase emulators"
      : `project ${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}`;
  console.log(`Seeding Super Admin ${input.email} into ${target}…`);

  const auth = adminAuth();
  const user = await auth.getUserByEmail(input.email).catch(() => null);
  const record = user
    ? await auth.updateUser(user.uid, {
        password: input.password,
        displayName: input.name,
        disabled: false,
      })
    : await auth.createUser({
        email: input.email,
        password: input.password,
        displayName: input.name,
      });

  await auth.setCustomUserClaims(record.uid, { role: "super_admin" });
  await auth.revokeRefreshTokens(record.uid);

  const ref = adminDb().collection("users").doc(record.uid);
  const now = new Date().toISOString();
  await adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    tx.set(
      ref,
      {
        uid: record.uid,
        name: input.name,
        email: input.email,
        role: "super_admin",
        disabled: false,
        updatedAt: now,
        ...(existing.exists ? {} : { createdAt: now }),
      },
      { merge: true },
    );
  });
  await adminDb()
    .collection("auditLogs")
    .add({
      entity: "user",
      entityId: record.uid,
      action: user ? "seed_promote_super_admin" : "seed_create_super_admin",
      before: null,
      after: { email: input.email, role: "super_admin" },
      userId: "seed-script",
      timestamp: FieldValue.serverTimestamp(),
    });

  console.log(`Done. ${input.email} is a Super Admin (uid ${record.uid}).`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
