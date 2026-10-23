import { z } from "zod";

export const investorSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).optional().default(""),
  notes: z.string().trim().max(2000).optional().default(""),
  status: z.enum(["active", "inactive"]).default("active"),
});

export type InvestorInput = z.infer<typeof investorSchema>;
