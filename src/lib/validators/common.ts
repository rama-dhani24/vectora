import { z } from "zod";

/** Positive whole TZS amount. Shared by forms, server actions and import. */
export const tzsAmountSchema = z
  .number({ error: "Enter an amount" })
  .int({ error: "Amount must be a whole number of TZS" })
  .positive({ error: "Amount must be greater than 0" })
  .max(Number.MAX_SAFE_INTEGER, { error: "Amount is too large" });

export const isoDateSchema = z.iso.date({ error: "Use a valid date (YYYY-MM-DD)" });
