import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { FastifyRequest } from "fastify";

/**
 * Loại token. Có mặt trong MỌI JWT mà hệ thống ký.
 *
 * ---
 * VÌ SAO PHẢI CÓ TRƯỜNG NÀY
 *
 * Hệ thống ký nhiều loại JWT bằng CÙNG một khoá: access token, vé 2FA (cấp sau
 * khi mật khẩu đúng nhưng chưa nhập mã), `state` của OAuth, mã trao đổi sau
 * callback OAuth. Không phân loại thì một vé 2FA — thứ chỉ chứng minh "vừa
 * nhập đúng mật khẩu" — sẽ được `JwtAuthGuard` chấp nhận như một access token
 * hoàn chỉnh, tức là 2FA bị vô hiệu hoá bằng cách bỏ qua bước thứ hai.
 *
 * Guard dùng DANH SÁCH TRẮNG (`typ === "access"`), không phải danh sách đen:
 * thêm một loại token mới sau này thì nó bị từ chối theo mặc định, thay vì âm
 * thầm được nhận.
 */
export type TokenType = "access" | "2fa" | "oauth_state" | "oauth_exchange";

/**
 * Nội dung access token, sau khi đã xác thực chữ ký.
 *
 * ⚠️ `roles` ở đây là ẢNH CHỤP tại thời điểm cấp token, KHÔNG phải trạng thái
 * hiện tại. Dùng nó để hiển thị (menu, nhãn) thì được; để QUYẾT ĐỊNH quyền thì
 * KHÔNG — `PermissionsGuard` luôn tra lại từ database qua `PermissionService`.
 * Nếu không, người vừa bị hạ quyền vẫn thao tác được cho tới khi token hết hạn.
 */
export type CurrentUserPayload = {
  typ: "access";
  /** `user.id` */
  sub: string;
  email: string | null;
  roles: string[];
  /**
   * `familyId` của phiên — ĐỊNH DANH PHIÊN, không đổi qua các lần refresh.
   *
   * Dùng để đánh dấu "thiết bị này" trong danh sách phiên, và để `đổi mật khẩu`
   * biết phiên nào được giữ lại thay vì đăng xuất chính người đang thao tác.
   */
  sid?: string;
  /**
   * Phiên này đã vượt qua 2FA chưa (ISO 8601).
   *
   * Có mặt để sau này bạn siết thêm: bắt xác thực lại 2FA cho thao tác cực
   * nhạy cảm (chuyển tiền, xoá dữ liệu) nếu lần xác thực gần nhất đã quá lâu.
   */
  mfa?: string;
};

/** Vé trung gian: mật khẩu đã đúng, còn thiếu mã 2FA. */
export type TwoFactorChallengePayload = {
  typ: "2fa";
  sub: string;
};

export type AuthenticatedRequest = FastifyRequest & { user?: CurrentUserPayload };

/**
 * @example async me(@CurrentUser() user: CurrentUserPayload) { … }
 * @example async id(@CurrentUser("sub") userId: string) { … }
 */
export const CurrentUser = createParamDecorator(
  (field: keyof CurrentUserPayload | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) return undefined;
    return field ? user[field] : user;
  },
);
