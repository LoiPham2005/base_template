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
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { FastifyRequest } from "fastify";
import {
  AUDIT_ACTIONS,
  type ActiveSession,
  type AuthResponse,
  type PublicUser,
  type TwoFactorChallenge,
} from "@repo/contracts";
import {
  AuditService,
  AuthService,
  InvalidRefreshTokenError,
  InvalidTwoFactorCodeError,
  PermissionService,
  TokenService,
  TwoFactorRequiredError,
  TwoFactorService,
  UserService,
} from "@repo/core";
import { Public } from "../common/decorators/public.decorator";
import { RateLimit } from "../common/decorators/rate-limit.decorator";
import { CurrentUser, type CurrentUserPayload } from "../common/decorators/current-user.decorator";
import { clientIp, userAgent } from "../common/request";
import { SessionService } from "./session.service";
import {
  ChangePasswordDto,
  ConfirmEmailChangeDto,
  ForgotPasswordDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  RequestEmailChangeDto,
  RequestPhoneOtpDto,
  ResendVerificationDto,
  ResetPasswordDto,
  UpdateProfileDto,
  VerifyEmailDto,
  VerifyPhoneOtpDto,
  VerifyTwoFactorDto,
} from "./auth.dto";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UserService,
    private readonly tokens: TokenService,
    private readonly sessions: SessionService,
    private readonly permissions: PermissionService,
    private readonly twoFactor: TwoFactorService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // Đăng ký / đăng nhập
  // -------------------------------------------------------------------------

  @Public()
  @RateLimit("register")
  @Post("register")
  @ApiOperation({ summary: "Đăng ký tài khoản mới" })
  async register(@Body() dto: RegisterDto, @Req() request: FastifyRequest): Promise<AuthResponse> {
    const user = await this.auth.register(dto);
    const tokens = await this.sessions.issue(user, {
      userAgent: userAgent(request),
      ip: clientIp(request),
    });

    return { user, tokens };
  }

  /**
   * Đăng nhập.
   *
   * Trả về MỘT TRONG HAI hình dạng:
   *
   *   • `{ user, tokens }`                        — xong, đăng nhập thành công.
   *   • `{ twoFactorRequired: true, challengeToken, expiresIn }` — tài khoản có
   *     bật 2FA; gửi tiếp `challengeToken` + mã tới `POST /auth/2fa/verify`.
   *
   * Hai hình dạng KHÁC HẲN nhau có chủ đích: client buộc phải rẽ nhánh tường
   * minh, thay vì đọc phải một object thiếu `tokens` rồi hỏng ở đâu đó xa hơn.
   */
  @Public()
  @RateLimit("login")
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Đăng nhập — trả về token, hoặc vé 2FA nếu tài khoản đã bật" })
  async login(
    @Body() dto: LoginDto,
    @Req() request: FastifyRequest,
  ): Promise<AuthResponse | TwoFactorChallenge> {
    let user: PublicUser;

    try {
      user = await this.auth.validateCredentials(dto);
    } catch (error) {
      /*
       * KHÔNG phải lỗi — đây là một bước trong luồng đăng nhập.
       *
       * `validateCredentials` ném thay vì trả cờ để nơi gọi không thể vô tình
       * bỏ qua bước thứ hai; bắt lại ở đây là chỗ duy nhất biết phải làm gì
       * tiếp theo. Mật khẩu ĐÃ đúng tại thời điểm này.
       */
      if (error instanceof TwoFactorRequiredError) {
        return this.sessions.issueTwoFactorChallenge(error.userId);
      }
      throw error;
    }

    const tokens = await this.sessions.issue(user, {
      userAgent: userAgent(request),
      ip: clientIp(request),
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.LOGIN_SUCCEEDED,
      entity: "User",
      entityId: user.id,
      actorId: user.id,
      actorEmail: user.email,
      ip: clientIp(request),
      userAgent: userAgent(request),
    });

    return { user, tokens };
  }

  /**
   * Bước hai của đăng nhập khi tài khoản có bật 2FA.
   *
   * Công khai CÓ CHỦ ĐÍCH: người dùng chưa có access token, họ mới có vé. Vé
   * mang `typ: "2fa"` nên `JwtAuthGuard` từ chối dùng nó ở bất cứ đâu khác.
   *
   * Chấp nhận cả mã TOTP lẫn mã khôi phục — người dùng ở màn hình này chỉ có
   * một ô nhập và không nên phải tự phân loại thứ mình đang dán vào.
   */
  @Public()
  @RateLimit("twoFactor")
  @Post("2fa/verify")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Xác minh mã 2FA để hoàn tất đăng nhập" })
  async verifyTwoFactor(
    @Body() dto: VerifyTwoFactorDto,
    @Req() request: FastifyRequest,
  ): Promise<AuthResponse> {
    const userId = await this.sessions.verifyTwoFactorChallenge(dto.challengeToken);

    if (!(await this.twoFactor.verifyCode(userId, dto.code))) {
      await this.audit.record({
        action: AUDIT_ACTIONS.TWO_FACTOR_FAILED,
        entity: "User",
        entityId: userId,
        actorId: userId,
        ip: clientIp(request),
        userAgent: userAgent(request),
      });

      throw new InvalidTwoFactorCodeError();
    }

    // Kiểm lại trạng thái tài khoản: nó có thể vừa bị khoá trong vài giây giữa
    // bước nhập mật khẩu và bước nhập mã.
    const user = await this.auth.completeTwoFactorLogin(userId);

    const twoFactorAt = new Date();

    const tokens = await this.sessions.issue(user, {
      userAgent: userAgent(request),
      ip: clientIp(request),
      twoFactorAt,
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.LOGIN_SUCCEEDED,
      entity: "User",
      entityId: user.id,
      actorId: user.id,
      actorEmail: user.email,
      metadata: { twoFactor: true },
      ip: clientIp(request),
      userAgent: userAgent(request),
    });

    return { user, tokens };
  }

  /**
   * Đổi refresh token lấy cặp token mới.
   *
   * Công khai CÓ CHỦ ĐÍCH: access token cũ đã hết hạn nên client không gửi kèm
   * được — chính refresh token mới là thứ chứng minh danh tính ở đây.
   */
  @Public()
  @RateLimit("refresh")
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Làm mới access token (refresh token sẽ xoay vòng)" })
  async refresh(@Body() dto: RefreshDto, @Req() request: FastifyRequest): Promise<AuthResponse> {
    const rotated = await this.tokens.rotate(dto.refreshToken, {
      userAgent: userAgent(request),
      ip: clientIp(request),
    });

    // `rotate` ném lỗi riêng khi token đã thu hồi bị dùng lại (dấu hiệu bị đánh
    // cắp). `null` ở đây chỉ là "hết hạn hoặc không tồn tại" — trường hợp bình
    // thường, người dùng đăng nhập lại.
    if (!rotated) throw new InvalidRefreshTokenError();

    const user = await this.users.findById(rotated.userId);
    if (!user) throw new InvalidRefreshTokenError();

    return { user, tokens: await this.sessions.signFromRotated(user, rotated.refresh) };
  }

  /**
   * Đăng xuất thiết bị hiện tại.
   *
   * Công khai vì client thường gọi nó khi access token đã hết hạn. Không rò rỉ
   * gì: refresh token không hợp lệ chỉ đơn giản là không có gì bị thu hồi.
   */
  @Public()
  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Đăng xuất thiết bị hiện tại" })
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.tokens.revoke(dto.refreshToken);
  }

  // -------------------------------------------------------------------------
  // Tài khoản hiện tại
  // -------------------------------------------------------------------------

  @Get("me")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Thông tin tài khoản đang đăng nhập (kèm quyền hiệu lực)" })
  async me(@CurrentUser("sub") userId: string) {
    const [profile, permissions] = await Promise.all([
      this.users.getProfile(userId),
      this.permissions.permissionsFor(userId),
    ]);

    // Trả kèm danh sách quyền để giao diện tự ẩn/hiện nút mà không phải đoán
    // theo vai trò — và không phải gọi thêm một endpoint nữa ở mỗi lần mở app.
    return { ...profile, permissions: [...permissions] };
  }

  @Patch("me")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Cập nhật hồ sơ cá nhân" })
  async updateMe(
    @CurrentUser("sub") userId: string,
    @Body() dto: UpdateProfileDto,
  ): Promise<PublicUser> {
    return this.users.updateProfile(userId, dto);
  }

  @RateLimit("passwordChange")
  @Post("change-password")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Đổi mật khẩu (đăng xuất mọi thiết bị khác)" })
  async changePassword(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ChangePasswordDto,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    // `sid` là `familyId` của phiên đang gọi request này — giữ nó lại, nếu
    // không người dùng bị đăng xuất khỏi chính thiết bị họ vừa thao tác, trông
    // y như lỗi.
    await this.auth.changePassword(user.sub, dto.currentPassword, dto.newPassword, user.sid);

    await this.audit.record({
      action: AUDIT_ACTIONS.PASSWORD_CHANGED,
      entity: "User",
      entityId: user.sub,
      actorId: user.sub,
      actorEmail: user.email,
      ip: clientIp(request),
      userAgent: userAgent(request),
    });
  }

  // -------------------------------------------------------------------------
  // Quên mật khẩu / xác thực email
  // -------------------------------------------------------------------------

  /**
   * LUÔN trả 204, kể cả khi email không tồn tại.
   *
   * Bất kỳ khác biệt nào — giá trị trả về, mã lỗi, hay chỉ là thời gian phản
   * hồi — đều biến endpoint công khai này thành công cụ dò danh sách người dùng.
   */
  @Public()
  @RateLimit("passwordResetRequest")
  @Post("forgot-password")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Gửi link đặt lại mật khẩu (luôn trả 204)" })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    await this.auth.requestPasswordReset(dto.email);
  }

  @Public()
  @RateLimit("passwordChange")
  @Post("reset-password")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Đặt mật khẩu mới bằng token trong email" })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    const userId = await this.auth.resetPassword(dto.token, dto.password);

    await this.audit.record({
      action: AUDIT_ACTIONS.PASSWORD_RESET,
      entity: "User",
      entityId: userId,
      actorId: userId,
      ip: clientIp(request),
      userAgent: userAgent(request),
    });
  }

  @Public()
  @Post("verify-email")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Xác thực email bằng token trong link" })
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<PublicUser> {
    return this.auth.verifyEmail(dto.token);
  }

  @Public()
  @RateLimit("emailVerificationRequest")
  @Post("verify-email/request")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Gửi lại email xác thực (luôn trả 204)" })
  async resendVerification(@Body() dto: ResendVerificationDto): Promise<void> {
    await this.auth.resendEmailVerification(dto.email);
  }

  // -------------------------------------------------------------------------
  // Đổi địa chỉ email
  // -------------------------------------------------------------------------

  /**
   * Bước 1 — xin đổi sang địa chỉ mới.
   *
   * Gửi link xác nhận tới địa chỉ MỚI, và thư cảnh báo tới địa chỉ CŨ. Thư thứ
   * hai mới là phần quan trọng: nếu tài khoản đã bị chiếm, đó là tín hiệu duy
   * nhất mà chủ thật nhận được.
   */
  @RateLimit("emailVerificationRequest")
  @Post("change-email")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Xin đổi địa chỉ email (cần mật khẩu hiện tại)" })
  async requestEmailChange(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: RequestEmailChangeDto,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    await this.auth.requestEmailChange(user.sub, dto.newEmail, dto.password);

    await this.audit.record({
      action: AUDIT_ACTIONS.EMAIL_CHANGE_REQUESTED,
      entity: "User",
      entityId: user.sub,
      actorId: user.sub,
      actorEmail: user.email,
      ip: clientIp(request),
      userAgent: userAgent(request),
    });
  }

  /**
   * Bước 2 — xác nhận bằng link gửi tới địa chỉ mới.
   *
   * Công khai vì người dùng có thể bấm link từ một trình duyệt chưa đăng nhập.
   * Bản thân token đã chứng minh quyền sở hữu hộp thư mới.
   */
  @Public()
  @Post("change-email/confirm")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Xác nhận đổi email (thu hồi mọi phiên đăng nhập)" })
  async confirmEmailChange(
    @Body() dto: ConfirmEmailChangeDto,
    @Req() request: FastifyRequest,
  ): Promise<PublicUser> {
    const user = await this.auth.confirmEmailChange(dto.token);

    await this.audit.record({
      action: AUDIT_ACTIONS.EMAIL_CHANGED,
      entity: "User",
      entityId: user.id,
      actorId: user.id,
      actorEmail: user.email,
      ip: clientIp(request),
      userAgent: userAgent(request),
    });

    return user;
  }

  // -------------------------------------------------------------------------
  // Xác thực số điện thoại (SMS)
  // -------------------------------------------------------------------------

  /**
   * Gửi mã OTP tới số điện thoại người dùng muốn gắn vào tài khoản.
   *
   * ⚠️ Đây là endpoint DUY NHẤT trong hệ thống có chi phí TRỰC TIẾP trên mỗi
   * lần gọi. Ngoài `@RateLimit("phoneOtp")` theo IP ở đây, `AuthService` còn
   * chặn theo giãn cách và trần-theo-ngày trên chính SỐ ĐIỆN THOẠI — vì kẻ
   * tấn công xoay IP được, còn số nạn nhân thì chỉ có một.
   *
   * Mặc định TẮT (`PHONE_VERIFICATION_ENABLED=0`).
   */
  @RateLimit("phoneOtp")
  @Post("phone/request-otp")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Gửi mã OTP để gắn số điện thoại (mặc định tắt)" })
  async requestPhoneOtp(
    @CurrentUser("sub") userId: string,
    @Body() dto: RequestPhoneOtpDto,
  ): Promise<void> {
    await this.auth.requestPhoneVerification(userId, dto.phone);
  }

  @RateLimit("phoneOtp")
  @Post("phone/verify")
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Xác nhận mã OTP và gắn số điện thoại" })
  async verifyPhoneOtp(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: VerifyPhoneOtpDto,
    @Req() request: FastifyRequest,
  ): Promise<PublicUser> {
    const result = await this.auth.confirmPhoneVerification(user.sub, dto.code);

    await this.audit.record({
      action: AUDIT_ACTIONS.PHONE_VERIFIED,
      entity: "User",
      entityId: user.sub,
      actorId: user.sub,
      actorEmail: user.email,
      ip: clientIp(request),
      userAgent: userAgent(request),
    });

    return result;
  }

  // -------------------------------------------------------------------------
  // Quản lý phiên đăng nhập
  // -------------------------------------------------------------------------

  @Get("sessions")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Danh sách thiết bị đang đăng nhập" })
  async listSessions(@CurrentUser() user: CurrentUserPayload): Promise<ActiveSession[]> {
    const sessions = await this.tokens.listActive(user.sub);

    // Đánh dấu phiên hiện tại để giao diện không hiển thị nút "đăng xuất" cho
    // chính thiết bị người dùng đang cầm — hoặc hiển thị nó khác đi.
    return sessions.map((session) => ({ ...session, current: session.id === user.sid }));
  }

  @Delete("sessions/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Đăng xuất một thiết bị cụ thể" })
  async revokeSession(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id") id: string,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    // `revokeById` nhận `userId` và đưa nó vào `where` — không có ràng buộc đó
    // thì đoán id là đăng xuất được thiết bị của người khác. Trả `false` cho
    // mọi trường hợp thất bại và ta cố ý KHÔNG phân biệt chúng.
    const revoked = await this.tokens.revokeById(id, user.sub);

    if (revoked) {
      await this.audit.record({
        action: AUDIT_ACTIONS.SESSION_REVOKED,
        entity: "RefreshToken",
        entityId: id,
        actorId: user.sub,
        actorEmail: user.email,
        ip: clientIp(request),
      });
    }
  }

  @Delete("sessions")
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Đăng xuất TẤT CẢ thiết bị khác (giữ thiết bị hiện tại)" })
  async revokeOtherSessions(@CurrentUser() user: CurrentUserPayload) {
    const count = await this.tokens.revokeAllForUser(user.sub, { exceptFamilyId: user.sid });
    return { revoked: count };
  }
}
