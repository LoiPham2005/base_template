import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import type { FastifyRequest } from "fastify";
import {
  AUDIT_ACTIONS,
  confirmTwoFactorSchema,
  disableTwoFactorSchema,
  type TwoFactorSetupResponse,
  type TwoFactorStatusResponse,
} from "@repo/contracts";
import { AuditService, TwoFactorService } from "@repo/core";
import { CurrentUser, type CurrentUserPayload } from "../common/decorators/current-user.decorator";
import { RateLimit } from "../common/decorators/rate-limit.decorator";
import { clientIp, userAgent } from "../common/request";

export class ConfirmTwoFactorDto extends createZodDto(confirmTwoFactorSchema) {}
export class DisableTwoFactorDto extends createZodDto(disableTwoFactorSchema) {}

/**
 * Bật/tắt xác thực hai lớp cho tài khoản ĐANG ĐĂNG NHẬP.
 *
 * Phần xác minh mã lúc ĐĂNG NHẬP nằm ở `AuthController` (`POST /auth/2fa/verify`)
 * vì lúc đó người dùng chưa có access token — họ mới có vé.
 *
 * ---
 * LUỒNG BẬT: BA BƯỚC, KHÔNG PHẢI MỘT
 *
 *   1. `POST /auth/2fa/setup`   → trả `secret` + `uri` để dựng QR. CHƯA bật.
 *   2. Người dùng quét QR bằng app xác thực.
 *   3. `POST /auth/2fa/enable`  → mã đúng thì mới bật, và trả về mã khôi phục.
 *
 * Bước 3 không phải thủ tục thừa: nó chứng minh app xác thực ĐÃ lưu đúng bí
 * mật. Bật ngay từ bước 1 thì người quét QR hỏng sẽ bị khoá vĩnh viễn khỏi tài
 * khoản của chính mình.
 */
@ApiTags("auth")
@ApiBearerAuth()
@Controller("auth/2fa")
export class TwoFactorController {
  constructor(
    private readonly twoFactor: TwoFactorService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Trạng thái 2FA của tài khoản hiện tại" })
  async status(@CurrentUser("sub") userId: string): Promise<TwoFactorStatusResponse> {
    const status = await this.twoFactor.status(userId);

    // `available` cho giao diện biết có nên hiện nút "Bật 2FA" hay không. Hiện
    // một nút mà bấm vào chỉ ra lỗi cấu hình máy chủ thì tệ hơn là ẩn nó đi.
    return { ...status, available: this.twoFactor.isAvailable() };
  }

  @Post("setup")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Bước 1 — sinh bí mật và mã QR (chưa bật)" })
  async setup(@CurrentUser("sub") userId: string): Promise<TwoFactorSetupResponse> {
    return this.twoFactor.beginSetup(userId);
  }

  /**
   * Bước 3 — xác nhận và bật thật.
   *
   * Có rate limit: mã TOTP chỉ 6 chữ số, và endpoint này chấp nhận thử liên
   * tục nếu không chặn.
   */
  @Post("enable")
  @RateLimit("twoFactor")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Bước 3 — xác nhận mã và bật 2FA, trả về mã khôi phục" })
  async enable(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ConfirmTwoFactorDto,
    @Req() request: FastifyRequest,
  ) {
    const recoveryCodes = await this.twoFactor.confirmSetup(user.sub, dto.code);

    await this.audit.record({
      action: AUDIT_ACTIONS.TWO_FACTOR_ENABLED,
      entity: "User",
      entityId: user.sub,
      actorId: user.sub,
      actorEmail: user.email,
      ip: clientIp(request),
      userAgent: userAgent(request),
    });

    // ⚠️ ĐÂY LÀ LẦN DUY NHẤT mã khôi phục tồn tại ở dạng đọc được. Giao diện
    // phải hiển thị ngay và bắt người dùng xác nhận đã lưu.
    return { recoveryCodes };
  }

  @Delete()
  @RateLimit("twoFactor")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Tắt 2FA (cần mật khẩu + mã hợp lệ)" })
  async disable(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: DisableTwoFactorDto,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    await this.twoFactor.disable(user.sub, dto.password ?? null, dto.code);

    // Tắt 2FA là hành động HẠ mức bảo vệ của tài khoản — phải nằm trong nhật ký
    // để sau này còn trả lời được "ai tắt, lúc nào".
    await this.audit.record({
      action: AUDIT_ACTIONS.TWO_FACTOR_DISABLED,
      entity: "User",
      entityId: user.sub,
      actorId: user.sub,
      actorEmail: user.email,
      ip: clientIp(request),
      userAgent: userAgent(request),
    });
  }

  @Post("recovery-codes")
  @RateLimit("twoFactor")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Cấp lại bộ mã khôi phục (mã cũ mất hiệu lực ngay)" })
  async regenerate(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ConfirmTwoFactorDto,
    @Req() request: FastifyRequest,
  ) {
    const recoveryCodes = await this.twoFactor.regenerateRecoveryCodes(user.sub, dto.code);

    await this.audit.record({
      action: AUDIT_ACTIONS.TWO_FACTOR_RECOVERY_REGENERATED,
      entity: "User",
      entityId: user.sub,
      actorId: user.sub,
      actorEmail: user.email,
      ip: clientIp(request),
    });

    return { recoveryCodes };
  }
}
