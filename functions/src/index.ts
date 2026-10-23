import { initializeApp } from "firebase-admin/app";
import { setGlobalOptions } from "firebase-functions/v2";
import { onRequest } from "firebase-functions/v2/https";

initializeApp();
setGlobalOptions({ region: "europe-west1", maxInstances: 10 });

/** Health check used to confirm the Functions emulator / deployment is wired up. */
export const health = onRequest((_request, response) => {
  response.json({ ok: true, service: "vectora-functions" });
});
