import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { PublicUser, TokenPair } from "@repo/contracts";
import { TokenService, env as coreEnv } from "@repo/core";
import type { CurrentUserPayload } from "../common/decorators/current-user.decorator";

/**
 * Cấp cặp access + refresh token.
 *
 * ---
 * VÌ SAO NẰM Ở `apps/api` CHỨ KHÔNG PHẢI `packages/core`
 *
 * Việc ký JWT cần `JWT_SECRET`, và `JWT_SECRET` là chuyện của tiến trình HTTP.
 * `apps/worker` import `@repo/core` nhưng không ký token nào — đẩy việc này
 * xuống core sẽ buộc worker phải khai một biến môi trường nó không dùng.
 *
 * `packages/core` vẫn giữ phần refresh token (opaque, lưu database) vì đó là
 * nghiệp vụ thật: xoay vòng, thu hồi, phát hiện dùng lại.
 *
 * ---
 * VÌ SAO GOM VÀO MỘT HÀM
 *
 * `login`, `register`, `refresh` và callback OAuth đều phải trả về CÙNG một
 * hình dạng. Ba hình dạng khác nhau cho ba endpoint là lỗi thiết kế API phổ
 * biến nhất, và cũng tốn công nhất để sửa về sau vì app đã lên store rồi.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly jwt: JwtService,
    private readonly tokens: TokenService,
  ) {}

  async issue(
    user: Pick<PublicUser, "id" | "email" | "roles">,
    context: { userAgent?: string | null; ip?: string | null; deviceId?: string | null } = {},
  ): Promise<TokenPair> {
    const refresh = await this.tokens.issue(user.id, context);
    return this.sign(user, refresh.id, refresh.token, refresh.expiresAt);
  }

  /** Dùng cho `/auth/refresh`: refresh token đã được xoay vòng ở tầng core. */
  async signFromRotated(
    user: Pick<PublicUser, "id" | "email" | "roles">,
    refresh: { id: string; token: string; expiresAt: Date },
  ): Promise<TokenPair> {
    return this.sign(user, refresh.id, refresh.token, refresh.expiresAt);
  }

  private async sign(
    user: Pick<PublicUser, "id" | "email" | "roles">,
    sessionId: string,
    refreshToken: string,
    refreshExpiresAt: Date,
  ): Promise<TokenPair> {
    const expiresIn = coreEnv.ACCESS_TOKEN_TTL_MINUTES * 60;

    const payload: CurrentUserPayload = {
      sub: user.id,
      email: user.email,
      // `roles` chỉ để hiển thị. Quyền LUÔN được `PermissionsGuard` tra lại từ
      // database — xem ghi chú ở đó.
      roles: user.roles,
      sid: sessionId,
    };

    const accessToken = await this.jwt.signAsync(payload, { expiresIn });

    return {
      accessToken,
      expiresIn,
      tokenType: "Bearer",
      refreshToken,
      refreshExpiresAt: refreshExpiresAt.toISOString(),
      sessionId,
    };
  }
}
