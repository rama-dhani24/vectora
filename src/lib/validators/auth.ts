import { z } from "zod";
import { USER_ROLES } from "@/types";

export const loginSchema = z.object({
  email: z.email({ error: "emailInvalid" }).trim().toLowerCase(),
  password: z.string().min(1, { error: "passwordRequired" }),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const sessionRequestSchema = z.object({
  idToken: z.string().min(1),
});

export const roleSchema = z.enum(USER_ROLES);

export const createUserSchema = z.object({
  name: z.string().trim().min(2, { error: "Name must be at least 2 characters" }).max(80),
  email: z.email({ error: "Enter a valid email address" }).trim().toLowerCase(),
  password: z.string().min(8, { error: "Password must be at least 8 characters" }).max(128),
  role: roleSchema,
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateRoleSchema = z.object({
  uid: z.string().min(1),
  role: roleSchema,
});

export const setDisabledSchema = z.object({
  uid: z.string().min(1),
  disabled: z.boolean(),
});
