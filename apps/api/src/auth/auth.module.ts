import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import {
  AuditService,
  AuthService,
  OAuthService,
  PermissionService,
  SecurityStampService,
  TokenService,
  TwoFactorService,
  UserService,
  WebAuthnService,
  core,
} from "@repo/core";
import { env } from "../env";
import { AuthController } from "./auth.controller";
import { OAuthController } from "./oauth.controller";
import { TwoFactorController } from "./two-factor.controller";
import { PasskeyController } from "./passkey.controller";
import { SessionService } from "./session.service";

/**
 * `@Global()` vì `PermissionsGuard` chạy toàn cục và cần `PermissionService`.
 *
 * Không có nó thì mọi module đều phải import lại `AuthModule` chỉ để một guard
 * toàn cục hoạt động — một thứ lặp lại ở khắp nơi mà không nói lên điều gì.
 *
 * ---
 * VÌ SAO `useValue: core.x` CHỨ KHÔNG PHẢI `useClass`
 *
 * Service thật đã được khởi tạo sẵn trong `container.ts` của `@repo/core`, nối
 * với đúng một instance Prisma. Để NestJS tự `new` chúng là tạo ra một bộ thứ
 * hai — và `apps/worker` (không chạy NestJS) sẽ dùng bộ khác với `apps/api`.
 */
@Global()
@Module({
  imports: [
    JwtModule.register({
      secret: env.JWT_SECRET,
      // Hạn được truyền ở từng lần ký (`SessionService`, `OAuthController`) vì
      // access token, `state` của OAuth và mã trao đổi có hạn rất khác nhau.
      // Đặt mặc định ở đây chỉ tạo ảo giác rằng chúng giống nhau.
    }),
  ],
  controllers: [AuthController, TwoFactorController, PasskeyController, OAuthController],
  providers: [
    SessionService,
    { provide: AuthService, useValue: core.auth },
    { provide: UserService, useValue: core.user },
    { provide: TokenService, useValue: core.token },
    { provide: PermissionService, useValue: core.permission },
    { provide: OAuthService, useValue: core.oauth },
    { provide: TwoFactorService, useValue: core.twoFactor },
    { provide: SecurityStampService, useValue: core.securityStamp },
    { provide: WebAuthnService, useValue: core.webauthn },
    { provide: AuditService, useValue: core.audit },
  ],
  exports: [
    JwtModule,
    SessionService,
    AuthService,
    UserService,
    TokenService,
    PermissionService,
    OAuthService,
    TwoFactorService,
    WebAuthnService,
    SecurityStampService,
    AuditService,
  ],
})
export class AuthModule {}
