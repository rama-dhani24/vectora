import { z } from "zod";
import { tzsAmountSchema } from "@/lib/validators/common";

export const transactionSchema = z.object({
  challengeId: z.string().min(1),
  investorId: z.string().min(1),
  type: z.enum(["UNITS", "STOCK_MARKET"]),
  amount: tzsAmountSchema,
  date: z.iso.date(),
  institution: z.string().trim().max(160).optional().default(""),
  reference: z.string().trim().max(120).optional().default(""),
  proofUrl: z.url().optional().or(z.literal("")),
  proofPath: z.string().max(500).optional().default(""),
  rawMessage: z.string().trim().max(5000).optional().default(""),
  notes: z.string().trim().max(2000).optional().default(""),
  status: z.enum(["pending", "verified", "rejected"]).default("pending"),
  source: z.enum(["manual", "import"]).default("manual"),
  allowDuplicate: z.boolean().default(false),
});

export type TransactionInput = z.infer<typeof transactionSchema>;
