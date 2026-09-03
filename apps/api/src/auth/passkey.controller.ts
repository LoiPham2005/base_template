import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import type { FastifyRequest } from "fastify";
import {
  AUDIT_ACTIONS,
  loginPasskeySchema,
  registerPasskeySchema,
  renamePasskeySchema,
  type AuthResponse,
  type Passkey,
} from "@repo/contracts";
import { AuditService, WebAuthnService, isWebAuthnConfigured } from "@repo/core";
import { Public } from "../common/decorators/public.decorator";
import { RateLimit } from "../common/decorators/rate-limit.decorator";
import { CurrentUser, type CurrentUserPayload } from "../common/decorators/current-user.decorator";
import { clientIp, userAgent } from "../common/request";
import { SessionService } from "./session.service";

export class RegisterPasskeyDto extends createZodDto(registerPasskeySchema) {}
export class LoginPasskeyDto extends createZodDto(loginPasskeySchema) {}
export class RenamePasskeyDto extends createZodDto(renamePasskeySchema) {}

/**
 * Đăng nhập bằng passkey (vân tay / Face ID / Windows Hello / khoá cứng).
 *
 * ---
 * MỖI LUỒNG LÀ HAI BƯỚC, VÀ BƯỚC ĐẦU LUÔN CẤP MỘT "VÉ"
 *
 * WebAuthn yêu cầu máy chủ sinh một `challenge` ngẫu nhiên, rồi đối chiếu
 * chính nó ở bước xác minh — không có bước đối chiếu đó thì một phản hồi cũ
 * phát lại được.
 *
 * Vé là một JWT ngắn hạn chứa `challenge`, mang `typ: "webauthn_*"` nên
 * `JwtAuthGuard` từ chối dùng nó làm access token. Đổi lại: không cần bảng
 * lưu challenge, không cần dọn dẹp.
 *
 * ---
 * ĐĂNG NHẬP KHÔNG CẦN NHẬP EMAIL
 *
 * `/login/options` cố ý KHÔNG nhận tham số nào. Trình duyệt tự hiện mọi passkey
 * đã lưu cho tên miền này, người dùng chọn một cái, xong. Bắt nhập email trước
 * vừa thừa một bước, vừa biến endpoint thành công cụ dò xem email nào đã đăng ký.
 */
@ApiTags("auth")
@Controller("auth/passkeys")
export class PasskeyController {
  constructor(
    private readonly webauthn: WebAuthnService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // Đăng ký (người dùng đang đăng nhập)
  // ---------------------------------------------------------------------------

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: "Danh sách passkey của tài khoản hiện tại" })
  async list(@CurrentUser("sub") userId: string): Promise<{
    passkeys: Passkey[];
    available: boolean;
  }> {
    // `available` cho giao diện biết có nên hiện nút "Thêm passkey" không.
    // Hiện một nút mà bấm vào chỉ ra lỗi cấu hình máy chủ thì tệ hơn là ẩn nó.
    return { passkeys: await this.webauthn.list(userId), available: isWebAuthnConfigured() };
  }

  @Post("register/options")
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Bước 1 — tuỳ chọn cho navigator.credentials.create()" })
  async registerOptions(@CurrentUser("sub") userId: string) {
    const options = await this.webauthn.createRegistrationOptions(userId);

    return {
      options,
      challengeToken: await this.sessions.issueWebAuthnChallenge(
        "webauthn_reg",
        options.challenge,
        userId,
      ),
    };
  }

  @Post("register/verify")
  @RateLimit("passkey")
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Bước 2 — xác minh và lưu passkey" })
  async registerVerify(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: RegisterPasskeyDto,
    @Req() request: FastifyRequest,
  ): Promise<Passkey> {
    const ticket = await this.sessions.verifyWebAuthnChallenge(dto.challengeToken, "webauthn_reg");

    // Vé mang `sub` của người đã xin nó. Không đối chiếu thì A xin vé rồi đưa
    // cho B dùng, và passkey của B được gắn vào tài khoản A.
    if (ticket.sub !== user.sub) {
      throw new UnauthorizedException("Vé đăng ký passkey không thuộc về tài khoản này");
    }

    const passkey = await this.webauthn.verifyRegistration(
      user.sub,
      dto.response,
      ticket.challenge,
      dto.name,
    );

    await this.audit.record({
      action: AUDIT_ACTIONS.PASSKEY_REGISTERED,
      entity: "WebAuthnCredential",
      entityId: passkey.id,
      actorId: user.sub,
      actorEmail: user.email,
      metadata: { deviceType: passkey.deviceType, backedUp: passkey.backedUp },
      ip: clientIp(request),
      userAgent: userAgent(request),
    });

    return passkey;
  }

  // ---------------------------------------------------------------------------
  // Đăng nhập
  // ---------------------------------------------------------------------------

  @Public()
  @Post("login/options")
  @RateLimit("passkey")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Bước 1 — tuỳ chọn cho navigator.credentials.get()" })
  async loginOptions() {
    const options = await this.webauthn.createAuthenticationOptions();

    return {
      options,
      // Không có `sub`: ở luồng này ta CHƯA biết người dùng là ai, và đó là
      // điểm mạnh — danh tính đến từ chính passkey được chọn.
      challengeToken: await this.sessions.issueWebAuthnChallenge(
        "webauthn_auth",
        options.challenge,
      ),
    };
  }

  /**
   * Bước 2 — xác minh chữ ký và cấp token.
   *
   * KHÔNG hỏi thêm mã 2FA sau bước này, kể cả khi tài khoản có bật TOTP. Một
   * passkey với `userVerification: "required"` đã là hai yếu tố: thiết bị +
   * sinh trắc/PIN. Hỏi thêm chỉ khiến người dùng quay về dùng mật khẩu — tức
   * là làm hệ thống YẾU đi.
   */
  @Public()
  @Post("login/verify")
  @RateLimit("passkey")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Bước 2 — đăng nhập bằng passkey (không cần mật khẩu, không cần 2FA)" })
  async loginVerify(
    @Body() dto: LoginPasskeyDto,
    @Req() request: FastifyRequest,
  ): Promise<AuthResponse> {
    const ticket = await this.sessions.verifyWebAuthnChallenge(dto.challengeToken, "webauthn_auth");

    const user = await this.webauthn.verifyAuthentication(dto.response, ticket.challenge);

    const tokens = await this.sessions.issue(user, {
      userAgent: userAgent(request),
      ip: clientIp(request),
      // Đánh dấu phiên đã qua xác thực nhiều yếu tố — xem ghi chú trên hàm.
      twoFactorAt: new Date(),
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.LOGIN_SUCCEEDED,
      entity: "User",
      entityId: user.id,
      actorId: user.id,
      actorEmail: user.email,
      metadata: { method: "passkey" },
      ip: clientIp(request),
      userAgent: userAgent(request),
    });

    return { user, tokens };
  }

  // ---------------------------------------------------------------------------
  // Quản lý
  // ---------------------------------------------------------------------------

  @Patch(":id")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Đổi tên passkey" })
  async rename(
    @CurrentUser("sub") userId: string,
    @Param("id") id: string,
    @Body() dto: RenamePasskeyDto,
  ): Promise<Passkey> {
    return this.webauthn.rename(id, userId, dto.name);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Xoá passkey (từ chối nếu là cách đăng nhập cuối cùng)" })
  async remove(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id") id: string,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    await this.webauthn.remove(id, user.sub);

    await this.audit.record({
      action: AUDIT_ACTIONS.PASSKEY_REMOVED,
      entity: "WebAuthnCredential",
      entityId: id,
      actorId: user.sub,
      actorEmail: user.email,
      ip: clientIp(request),
      userAgent: userAgent(request),
    });
  }
}
