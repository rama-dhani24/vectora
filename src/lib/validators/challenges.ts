import { z } from "zod";

export const challengeSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    month: z.coerce.number().int().min(1).max(12),
    year: z.coerce.number().int().min(2000).max(2200),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    status: z.enum(["draft", "open", "closed"]).default("draft"),
  })
  .refine((value) => value.startDate <= value.endDate, {
    path: ["endDate"],
    message: "End date must be on or after the start date",
  });

export type ChallengeInput = z.infer<typeof challengeSchema>;
