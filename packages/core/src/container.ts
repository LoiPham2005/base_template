import { prisma } from "@repo/db";
import { UserService } from "./user/user.service";
import { PermissionService } from "./rbac/permission.service";
import { RoleService } from "./rbac/role.service";
import { TokenService } from "./auth/token.service";
import { VerificationService } from "./auth/verification.service";
import { AuthService } from "./auth/auth.service";
import { SecurityStampService } from "./auth/security-stamp.service";
import { TwoFactorService } from "./auth/two-factor.service";
import { OAuthService } from "./auth/oauth.service";
import { WebAuthnService } from "./auth/webauthn.service";
import { AuditService } from "./audit/audit.service";
import { NotificationService } from "./notification/notification.service";
import { DeviceService } from "./device/device.service";
import { HealthService } from "./health/health.service";

/**
 * Điểm khởi tạo DUY NHẤT của mọi service, đã nối sẵn với Prisma thật.
 *
 * `apps/api` và `apps/worker` cùng import `core` từ đây — không app nào tự
 * `new` service, và không app nào import `@repo/db` trực tiếp (ràng buộc này
 * được `@repo/eslint-config` enforce).
 *
 * ---
 * VÌ SAO KHÔNG DÙNG DI CONTAINER CỦA NESTJS CHO TẦNG NÀY
 *
 * `packages/core` phải chạy được ngoài NestJS: `apps/worker` là Node thuần,
 * và `prisma/seeds` là script chạy một lần. Buộc chúng phải dựng một
 * `NestFactory` chỉ để lấy được một service là cái giá không đáng.
 *
 * Ở phía NestJS thì các module vẫn khai `{ provide: UserService, useValue:
 * core.user }`, nên controller vẫn tiêm phụ thuộc như bình thường.
 *
 * ---
 * SERVICE LÀ STATELESS
 *
 * Chúng chỉ giữ tham chiếu tới Prisma và tới nhau. Vì vậy dùng chung một
 * instance cho toàn tiến trình là an toàn — không có trạng thái theo request
 * nào bị lẫn giữa hai người dùng.
 */

const permissions = new PermissionService(prisma);
const users = new UserService(prisma);
const tokens = new TokenService(prisma);
const verification = new VerificationService(prisma);
const securityStamp = new SecurityStampService(prisma);

export const core = {
  user: users,
  permission: permissions,
  role: new RoleService(prisma, permissions),
  token: tokens,
  verification,
  auth: new AuthService(prisma, users, verification, tokens, securityStamp),
  securityStamp,
  twoFactor: new TwoFactorService(prisma),
  oauth: new OAuthService(prisma, users),
  webauthn: new WebAuthnService(prisma, users),
  audit: new AuditService(prisma),
  notification: new NotificationService(prisma),
  device: new DeviceService(prisma),
  health: new HealthService(prisma),
};

export type Core = typeof core;
