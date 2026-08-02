import { prisma } from "@repo/db";
import { UserService } from "./user/user.service";
import { AuthService } from "./auth/auth.service";
import { HealthService } from "./health/health.service";

/**
 * Single instantiation point for every service, wired to the real
 * Prisma client. apps/web and apps/api both import `core` from here —
 * neither ever imports @repo/db directly (enforced by
 * @repo/eslint-config's noDirectDbImport rule on the apps).
 */
export const core = {
  user: new UserService(prisma),
  auth: new AuthService(prisma),
  health: new HealthService(prisma),
};
