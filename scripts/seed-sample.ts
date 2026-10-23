import { adminDb } from "../src/lib/firebase/admin-init";

const challengeId = "sample-august-2026";
const known = [
  { name: "Noela", units: 0, stock: 186167 },
  { name: "Irene B", units: 2000000, stock: 0 },
  { name: "Eve", units: 16764630, stock: 2801762 },
];

function distribute(total: number, count: number): number[] {
  const base = Math.floor(total / count);
  const extra = total % count;
  return Array.from({ length: count }, (_, index) => base + Number(index < extra));
}

async function main(): Promise<void> {
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR !== "true") {
    throw new Error("Sample data can only be seeded into the Firebase emulators.");
  }

  const remainingNames = Array.from({ length: 43 }, (_, index) =>
    `Sample Investor ${String(index + 4).padStart(2, "0")}`,
  );
  const unitShares = distribute(87312997, remainingNames.length);
  const stockShares = distribute(28409848, remainingNames.length);
  const investors = [
    ...known,
    ...remainingNames.map((name, index) => ({
      name,
      units: unitShares[index],
      stock: stockShares[index],
    })),
  ];
  const db = adminDb();
  const challengeRef = db.collection("challenges").doc(challengeId);
  const challengeSnapshot = await challengeRef.get();
  const batch = db.batch();
  const now = new Date().toISOString();
  if (!challengeSnapshot.exists) {
    batch.create(challengeRef, {
      title: "AUGUST 2026 INVESTING CHALLENGE",
      month: 8,
      year: 2026,
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      status: "open",
      totals: { units: 0, stock: 0, final: 0, participants: 0 },
      createdAt: now,
      updatedAt: now,
    });
    batch.create(db.collection("system").doc("openChallenge"), { challengeId });
  }

  for (const [index, investor] of investors.entries()) {
    const investorId = `sample-${String(index + 1).padStart(2, "0")}`;
    const investorRef = db.collection("investors").doc(investorId);
    if (!(await investorRef.get()).exists) {
      batch.create(investorRef, {
        name: investor.name,
        nameLower: investor.name.toLocaleLowerCase("en"),
        status: "active",
        phone: "",
        notes: "Deterministic emulator sample data",
        createdAt: now,
        updatedAt: now,
      });
    }

    for (const contribution of [
      { type: "UNITS" as const, amount: investor.units },
      { type: "STOCK_MARKET" as const, amount: investor.stock },
    ]) {
      if (contribution.amount === 0) continue;
      const transactionId = `${investorId}-${contribution.type.toLowerCase()}`;
      const transactionRef = db.collection("transactions").doc(transactionId);
      if ((await transactionRef.get()).exists) continue;
      batch.create(transactionRef, {
        challengeId,
        investorId,
        investorName: investor.name,
        type: contribution.type,
        amount: contribution.amount,
        date: "2026-08-15",
        institution: "",
        reference: "",
        proofUrl: "",
        proofPath: "",
        rawMessage: "",
        notes: "Deterministic emulator sample data",
        status: "verified",
        source: "import",
        createdBy: "seed-script",
        createdAt: now,
        updatedAt: now,
        verifiedBy: "seed-script",
        verifiedAt: now,
      });
    }
  }
  await batch.commit();
  console.log(
    `Seeded ${investors.length} investors for ${challengeId}. Expected verified totals: TZS 106,077,627 Units; TZS 31,397,777 Stock Market; TZS 137,475,404 final.`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
