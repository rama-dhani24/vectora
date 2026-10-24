import { z } from "zod";

export const loginSchema = z.object({
  email: z.email({ error: "emailInvalid" }).trim().toLowerCase(),
  password: z.string().min(1, { error: "passwordRequired" }),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const signupSchema = z.object({
  name: z.string().trim().min(2, { error: "Name must be at least 2 characters" }).max(80),
  groupName: z
    .string()
    .trim()
    .min(2, { error: "Group name must be at least 2 characters" })
    .max(120),
  email: z.email({ error: "emailInvalid" }).trim().toLowerCase(),
  password: z.string().min(8, { error: "Password must be at least 8 characters" }).max(128),
});
export type SignupInput = z.infer<typeof signupSchema>;
