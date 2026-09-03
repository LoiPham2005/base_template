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
} from "@repo/contracts";
import {
  AuditService,
  AuthService,
  InvalidRefreshTokenError,
  PermissionService,
  TokenService,
  UserService,
} from "@repo/core";
import { Public } from "../common/decorators/public.decorator";
import { RateLimit } from "../common/decorators/rate-limit.decorator";
import { CurrentUser, type CurrentUserPayload } from "../common/decorators/current-user.decorator";
import { clientIp, userAgent } from "../common/request";
import { SessionService } from "./session.service";
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  ResendVerificationDto,
  ResetPasswordDto,
  UpdateProfileDto,
  VerifyEmailDto,
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

  @Public()
  @RateLimit("login")
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Đăng nhập bằng email/tên đăng nhập + mật khẩu" })
  async login(@Body() dto: LoginDto, @Req() request: FastifyRequest): Promise<AuthResponse> {
    const user = await this.auth.validateCredentials(dto);

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
    // `sid` là phiên đang gọi request này — giữ nó lại, nếu không người dùng bị
    // đăng xuất khỏi chính thiết bị họ vừa thao tác, trông y như lỗi.
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
    const count = await this.tokens.revokeAllForUser(user.sub, { exceptId: user.sid });
    return { revoked: count };
  }
}
