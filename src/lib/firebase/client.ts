"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";
import { connectStorageEmulator, getStorage, type FirebaseStorage } from "firebase/storage";
import { EMULATOR_PORTS, emulatorHost, firebaseConfig, useEmulator } from "@/lib/firebase/config";

interface ClientServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
}

let services: ClientServices | null = null;

/** Lazily initialises the browser SDK so it never runs during server rendering. */
export function getClientServices(): ClientServices {
  if (services) return services;

  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const storage = getStorage(app);

  if (useEmulator) {
    connectAuthEmulator(auth, `http://${emulatorHost}:${EMULATOR_PORTS.auth}`, {
      disableWarnings: true,
    });
    connectFirestoreEmulator(db, emulatorHost, EMULATOR_PORTS.firestore);
    connectStorageEmulator(storage, emulatorHost, EMULATOR_PORTS.storage);
  }

  services = { app, auth, db, storage };
  return services;
}
