import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage, type Storage } from "firebase-admin/storage";

/**
 * Admin SDK bootstrap shared by the Next.js server and Node scripts.
 * Next.js code must import "@/lib/firebase/admin" instead, which adds the server-only guard.
 */
function configureEmulatorEnv(): void {
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR !== "true") return;
  const host = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST ?? "127.0.0.1";
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= `${host}:9099`;
  process.env.FIRESTORE_EMULATOR_HOST ??= `${host}:8080`;
  process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= `${host}:9199`;
}

function createApp(): App {
  configureEmulatorEnv();
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "demo-vectora";
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (clientEmail && privateKey) {
    return initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
      projectId,
      storageBucket,
    });
  }
  // Emulators need no credentials; on Google Cloud, Application Default Credentials are used.
  return initializeApp({ projectId, storageBucket });
}

export function getAdminApp(): App {
  return getApps().length ? getApp() : createApp();
}

export function adminAuth(): Auth {
  return getAuth(getAdminApp());
}

export function adminDb(): Firestore {
  return getFirestore(getAdminApp());
}

export function adminStorage(): Storage {
  return getStorage(getAdminApp());
}
