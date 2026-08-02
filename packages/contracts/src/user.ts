import { z } from "zod";

// Single source of truth for the "shape of a user". Used by:
// - react-hook-form on the web (zodResolver)
// - NestJS DTO validation (nestjs-zod) for the mobile API
// - packages/core as the input/output type for UserService
// Change a field here and every layer catches the mismatch at compile time.

export const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100).optional(),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().nullable(),
  // coerce: apps/api serializes this as an ISO string over JSON, while
  // packages/core (Prisma) hands back a real Date — this schema is used
  // to parse both.
  createdAt: z.coerce.date(),
});
export type User = z.infer<typeof userSchema>;
