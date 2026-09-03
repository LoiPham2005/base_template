import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { PublicUser, TokenPair, TwoFactorChallenge } from "@repo/contracts";
import { TokenService, env as coreEnv } from "@repo/core";
import type {
  CurrentUserPayload,
  TwoFactorChallengePayload,
  WebAuthnChallengePayload,
} from "../common/decorators/current-user.decorator";

/**
 * Cấp access token, refresh token và vé 2FA.
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
 * VÌ SAO GOM VÀO MỘT CHỖ
 *
 * `login`, `register`, `refresh`, xác thực 2FA và callback OAuth đều phải trả
 * về CÙNG một hình dạng. Năm hình dạng khác nhau cho năm lối vào là lỗi thiết
 * kế API phổ biến nhất, và cũng tốn công nhất để sửa về sau vì app đã lên
 * store rồi.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly jwt: JwtService,
    private readonly tokens: TokenService,
  ) {}

  async issue(
    user: Pick<PublicUser, "id" | "email" | "roles">,
    context: {
      userAgent?: string | null;
      ip?: string | null;
      deviceId?: string | null;
      /** Đặt khi phiên này vừa vượt qua 2FA. */
      twoFactorAt?: Date | null;
    } = {},
  ): Promise<TokenPair> {
    const refresh = await this.tokens.issue(user.id, context);
    return this.sign(user, refresh, context.twoFactorAt ?? null);
  }

  /** Dùng cho `/auth/refresh`: refresh token đã được xoay vòng ở tầng core. */
  async signFromRotated(
    user: Pick<PublicUser, "id" | "email" | "roles">,
    refresh: { id: string; familyId: string; token: string; expiresAt: Date },
    twoFactorAt: Date | null = null,
  ): Promise<TokenPair> {
    return this.sign(user, refresh, twoFactorAt);
  }

  private async sign(
    user: Pick<PublicUser, "id" | "email" | "roles">,
    refresh: { familyId: string; token: string; expiresAt: Date },
    twoFactorAt: Date | null,
  ): Promise<TokenPair> {
    const expiresIn = coreEnv.ACCESS_TOKEN_TTL_MINUTES * 60;

    const payload: CurrentUserPayload = {
      typ: "access",
      sub: user.id,
      email: user.email,
      // `roles` chỉ để hiển thị. Quyền LUÔN được `PermissionsGuard` tra lại từ
      // database — xem ghi chú ở đó.
      roles: user.roles,
      // `familyId`, không phải id của bản ghi token: giá trị này KHÔNG đổi qua
      // các lần refresh, nên client giữ được một định danh phiên ổn định.
      sid: refresh.familyId,
      ...(twoFactorAt ? { mfa: twoFactorAt.toISOString() } : {}),
    };

    const accessToken = await this.jwt.signAsync(payload, { expiresIn });

    return {
      accessToken,
      expiresIn,
      tokenType: "Bearer",
      refreshToken: refresh.token,
      refreshExpiresAt: refresh.expiresAt.toISOString(),
      sessionId: refresh.familyId,
    };
  }

  // ---------------------------------------------------------------------------
  // Vé 2FA
  // ---------------------------------------------------------------------------

  /**
   * Cấp vé sau khi mật khẩu đã đúng nhưng tài khoản có bật 2FA.
   *
   * Vé KHÔNG phải access token: nó mang `typ: "2fa"`, và `JwtAuthGuard` chỉ
   * chấp nhận `typ: "access"`. Nghĩa là cầm vé này không gọi được endpoint nào
   * ngoài `POST /auth/2fa/verify`.
   *
   * Hạn rất ngắn (mặc định 5 phút): vé chứng minh "vừa nhập đúng mật khẩu", và
   * để lâu là kéo dài cửa sổ mà một máy bị chiếm có thể hoàn tất đăng nhập.
   */
  async issueTwoFactorChallenge(userId: string): Promise<TwoFactorChallenge> {
    const expiresIn = coreEnv.TWO_FACTOR_CHALLENGE_TTL_MINUTES * 60;

    const payload: TwoFactorChallengePayload = { typ: "2fa", sub: userId };

    return {
      twoFactorRequired: true,
      challengeToken: await this.jwt.signAsync(payload, { expiresIn }),
      expiresIn,
    };
  }

  // ---------------------------------------------------------------------------
  // Vé WebAuthn
  // ---------------------------------------------------------------------------

  /**
   * Hạn của vé WebAuthn.
   *
   * Trùng với `timeout` mặc định mà `@simplewebauthn/server` đặt trong options
   * (60 giây), cộng dư ra cho người dùng lóng ngóng tìm khoá cứng. Để lâu hơn
   * là kéo dài cửa sổ phát lại một challenge.
   */
  private static readonly WEBAUTHN_TTL = "5m";

  /**
   * Ký `challenge` vào một vé ngắn hạn.
   *
   * Client gửi ngược vé này ở bước xác minh. Kẻ tấn công không tự tạo được vé
   * hợp lệ, nên không dựng được một luồng đăng ký/đăng nhập giả rồi ép nạn
   * nhân hoàn tất.
   */
  async issueWebAuthnChallenge(
    typ: "webauthn_reg" | "webauthn_auth",
    challenge: string,
    userId?: string,
  ): Promise<string> {
    const payload: WebAuthnChallengePayload = {
      typ,
      challenge,
      ...(userId ? { sub: userId } : {}),
    };

    return this.jwt.signAsync(payload, { expiresIn: SessionService.WEBAUTHN_TTL });
  }

  /** Đọc `challenge` (và `userId` nếu có) từ vé. Ném 401 cho vé hỏng/sai loại. */
  async verifyWebAuthnChallenge(
    token: string,
    expectedType: "webauthn_reg" | "webauthn_auth",
  ): Promise<WebAuthnChallengePayload> {
    try {
      const payload = await this.jwt.verifyAsync<WebAuthnChallengePayload>(token);

      // Không cho dùng vé ĐĂNG KÝ ở luồng ĐĂNG NHẬP: vé đăng ký mang `sub` của
      // một người đã đăng nhập, còn luồng đăng nhập thì tin vào passkey. Trộn
      // hai loại là mở một đường vòng.
      if (payload.typ !== expectedType) throw new Error("sai loại vé");

      return payload;
    } catch {
      throw new UnauthorizedException("Phiên xác thực passkey đã hết hạn. Vui lòng thử lại.");
    }
  }

  /**
   * Đọc `userId` từ vé. Ném 401 cho vé hỏng, hết hạn, HOẶC sai loại.
   *
   * Phép kiểm `typ` ở đây là chiều còn lại của phép kiểm trong `JwtAuthGuard`:
   * không có nó thì một access token hợp lệ dùng được làm vé, và người đã đăng
   * nhập bằng tài khoản A có thể… vẫn chỉ là chính họ. Nhưng nguyên tắc thì
   * không đổi — mỗi token chỉ dùng đúng một việc.
   */
  async verifyTwoFactorChallenge(challengeToken: string): Promise<string> {
    try {
      const payload = await this.jwt.verifyAsync<TwoFactorChallengePayload>(challengeToken);

      if (payload.typ !== "2fa") throw new Error("sai loại token");

      return payload.sub;
    } catch {
      throw new UnauthorizedException("Vé xác thực không hợp lệ hoặc đã hết hạn");
    }
  }
}
