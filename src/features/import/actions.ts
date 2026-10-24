"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AuthorizationError, assertRole } from "@/lib/auth/dal";
import { reconcileTotals } from "@/lib/domain/aggregation";
import { createClient } from "@/lib/supabase/server";

const importSchema = z.object({
  challengeId: z.string().uuid(),
  rows: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        investorId: z.string().uuid().optional(),
        units: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
        stock: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      }),
    )
    .min(1)
    .max(80),
  expected: z.object({
    units: z.number().int().nonnegative(),
    stock: z.number().int().nonnegative(),
    final: z.number().int().nonnegative(),
  }),
});

export interface ImportResult {
  ok: boolean;
  error?: string;
  reconciliation?: ReturnType<typeof reconcileTotals>;
}

export async function importSheetAction(input: unknown): Promise<ImportResult> {
  try {
    const actor = await assertRole("admin");
    const data = importSchema.parse(input);
    const reconciliation = reconcileTotals(data.rows, data.expected);
    if (!reconciliation.matches) {
      return {
        ok: false,
        error:
          "The imported totals do not match the sheet totals. Correct the data before importing.",
        reconciliation,
      };
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("import_challenge_sheet", {
      p_group_id: actor.groupId,
      p_challenge_id: data.challengeId,
      p_rows: data.rows,
      p_expected: data.expected,
    });
    if (error) throw error;
    for (const path of ["/dashboard", "/transactions", "/reports", "/investors"]) {
      revalidatePath(path);
    }
    return { ok: true, reconciliation };
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: error.message };
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? "Invalid import data." };
    }
    console.error("[import] action failed", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not import this sheet.",
    };
  }
}
