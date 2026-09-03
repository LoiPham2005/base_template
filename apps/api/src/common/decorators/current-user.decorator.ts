import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { FastifyRequest } from "fastify";

/**
 * Nội dung access token, sau khi đã xác thực chữ ký.
 *
 * ⚠️ `roles` ở đây là ẢNH CHỤP tại thời điểm cấp token, KHÔNG phải trạng thái
 * hiện tại. Dùng nó để hiển thị (menu, nhãn) thì được; để QUYẾT ĐỊNH quyền thì
 * KHÔNG — `PermissionsGuard` luôn tra lại từ database qua `PermissionService`.
 * Nếu không, người vừa bị hạ quyền vẫn thao tác được cho tới khi token hết hạn.
 */
export type CurrentUserPayload = {
  /** `user.id` */
  sub: string;
  email: string | null;
  roles: string[];
  /**
   * Id của refresh token đã sinh ra access token này.
   *
   * Dùng để đánh dấu "thiết bị này" trong danh sách phiên, và để `đổi mật khẩu`
   * biết phiên nào được giữ lại thay vì đăng xuất chính người đang thao tác.
   */
  sid?: string;
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
