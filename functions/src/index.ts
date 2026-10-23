import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, type DocumentData } from "firebase-admin/firestore";
import { setGlobalOptions } from "firebase-functions/v2";
import { onRequest } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";

initializeApp();
setGlobalOptions({ region: "europe-west1", maxInstances: 10 });

/** Health check used to confirm the Functions emulator / deployment is wired up. */
export const health = onRequest((_request, response) => {
  response.json({ ok: true, service: "vectora-functions" });
});

interface TxSnapshot {
  challengeId: string;
  investorId: string;
  investorName: string;
  type: "UNITS" | "STOCK_MARKET";
  amount: number;
  status: "pending" | "verified" | "rejected";
}

interface Delta {
  units: number;
  stock: number;
  investorName: string;
}

function toSnapshot(data: DocumentData | undefined): TxSnapshot | null {
  if (!data || data.status !== "verified") return null;
  if (
    typeof data.challengeId !== "string" ||
    typeof data.investorId !== "string" ||
    typeof data.investorName !== "string" ||
    (data.type !== "UNITS" && data.type !== "STOCK_MARKET") ||
    typeof data.amount !== "number" ||
    !Number.isSafeInteger(data.amount) ||
    data.amount <= 0
  ) {
    throw new Error("A verified transaction has invalid aggregate fields.");
  }
  return data as TxSnapshot;
}

function applyDelta(
  target: Map<string, Map<string, Delta>>,
  transaction: TxSnapshot,
  direction: 1 | -1,
): void {
  let investors = target.get(transaction.challengeId);
  if (!investors) {
    investors = new Map();
    target.set(transaction.challengeId, investors);
  }
  const current = investors.get(transaction.investorId) ?? {
    units: 0,
    stock: 0,
    investorName: transaction.investorName,
  };
  if (transaction.type === "UNITS") current.units += transaction.amount * direction;
  else current.stock += transaction.amount * direction;
  current.investorName = transaction.investorName;
  investors.set(transaction.investorId, current);
}

export const updateChallengeAggregates = onDocumentWritten(
  "transactions/{transactionId}",
  async (event) => {
    const before = toSnapshot(event.data?.before.data());
    const after = toSnapshot(event.data?.after.data());
    const changes = new Map<string, Map<string, Delta>>();
    if (before) applyDelta(changes, before, -1);
    if (after) applyDelta(changes, after, 1);
    if (changes.size === 0) return;

    const db = getFirestore();
    const eventRef = db.collection("aggregateEvents").doc(Buffer.from(event.id).toString("base64url"));
    await db.runTransaction(async (transaction) => {
      const eventSnapshot = await transaction.get(eventRef);
      if (eventSnapshot.exists) return;

      const totalsRefs = new Map<string, ReturnType<typeof db.doc>>();
      const challengeRefs = new Map<string, ReturnType<typeof db.doc>>();
      for (const [challengeId, investors] of changes) {
        challengeRefs.set(challengeId, db.collection("challenges").doc(challengeId));
        for (const investorId of investors.keys()) {
          const ref = db.doc(`challenges/${challengeId}/investorTotals/${investorId}`);
          totalsRefs.set(`${challengeId}:${investorId}`, ref);
        }
      }

      const refs = [...totalsRefs.values(), ...challengeRefs.values()];
      const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
      const snapshotByPath = new Map(snapshots.map((snapshot) => [snapshot.ref.path, snapshot]));
      const challengeDeltas = new Map<string, { units: number; stock: number; participants: number }>();

      for (const [challengeId, investors] of changes) {
        const challengeDelta = challengeDeltas.get(challengeId) ?? { units: 0, stock: 0, participants: 0 };
        for (const [investorId, delta] of investors) {
          const totalsRef = totalsRefs.get(`${challengeId}:${investorId}`);
          if (!totalsRef) throw new Error("Missing totals document reference.");
          const snapshot = snapshotByPath.get(totalsRef.path);
          const existing = snapshot?.data() ?? {};
          const previousUnits = typeof existing.units === "number" ? existing.units : 0;
          const previousStock = typeof existing.stock === "number" ? existing.stock : 0;
          const previousTotal = previousUnits + previousStock;
          const units = previousUnits + delta.units;
          const stock = previousStock + delta.stock;
          const total = units + stock;
          if (
            ![units, stock, total].every(Number.isSafeInteger) ||
            units < 0 ||
            stock < 0 ||
            total < 0
          ) {
            throw new Error(`Aggregate underflow or overflow for investor ${investorId}.`);
          }
          challengeDelta.units += delta.units;
          challengeDelta.stock += delta.stock;
          challengeDelta.participants += Number(total > 0) - Number(previousTotal > 0);
          if (total === 0) transaction.delete(totalsRef);
          else {
            transaction.set(
              totalsRef,
              {
                investorId,
                investorName: delta.investorName || existing.investorName || "",
                units,
                stock,
                total,
                updatedAt: FieldValue.serverTimestamp(),
              },
              { merge: true },
            );
          }
        }
        challengeDeltas.set(challengeId, challengeDelta);
      }

      for (const [challengeId, delta] of challengeDeltas) {
        const challengeRef = challengeRefs.get(challengeId);
        if (!challengeRef) throw new Error("Missing challenge document reference.");
        const snapshot = snapshotByPath.get(challengeRef.path);
        if (!snapshot?.exists) throw new Error(`Challenge ${challengeId} does not exist.`);
        const totals = snapshot.get("totals") as
          | { units?: number; stock?: number; final?: number; participants?: number }
          | undefined;
        const units = (totals?.units ?? 0) + delta.units;
        const stock = (totals?.stock ?? 0) + delta.stock;
        const participants = (totals?.participants ?? 0) + delta.participants;
        const final = units + stock;
        if (![units, stock, final, participants].every(Number.isSafeInteger) || Math.min(units, stock, participants) < 0) {
          throw new Error(`Aggregate underflow or overflow for challenge ${challengeId}.`);
        }
        transaction.update(challengeRef, {
          totals: { units, stock, final, participants },
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      transaction.create(eventRef, {
        eventId: event.id,
        transactionId: event.params.transactionId,
        processedAt: FieldValue.serverTimestamp(),
      });
    });
  },
);
