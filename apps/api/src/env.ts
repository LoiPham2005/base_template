import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string({ required_error: "DATABASE_URL là bắt buộc" }),
  JWT_SECRET: z.string().default("super-secret-jwt-key-change-in-production"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  CORS_ORIGIN: z.string().default("*"),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("❌ Environment variable validation error:");
    console.error(result.error.format());
    throw new Error("Invalid environment variables");
  }
  return result.data;
}

export const env = validateEnv();
