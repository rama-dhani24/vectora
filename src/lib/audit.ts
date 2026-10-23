import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type { AuditEntity } from "@/types";

interface AuditInput {
  entity: AuditEntity;
  entityId: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  userId: string;
}

export async function writeAuditLog(input: AuditInput): Promise<void> {
  await adminDb()
    .collection("auditLogs")
    .add({ ...input, timestamp: FieldValue.serverTimestamp() });
}
