type FirestoreTimestamp = { toDate: () => Date };

function isFirestoreTimestamp(value: unknown): value is FirestoreTimestamp {
  return (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof value.toDate === "function"
  );
}

/** Convert Firestore values into plain data that can safely cross into client components. */
export function serializeFirestoreData(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (isFirestoreTimestamp(value)) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serializeFirestoreData);

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, serializeFirestoreData(item)]),
  );
}
