import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Permission } from "@repo/contracts";
import { PermissionService } from "@repo/core";
import {
  PERMISSIONS_KEY,
  PERMISSIONS_MODE_KEY,
  type PermissionMode,
} from "../decorators/permissions.decorator";
import type { AuthenticatedRequest } from "../decorators/current-user.decorator";

/**
 * Kiểm tra quyền, đăng ký TOÀN CỤC sau `JwtAuthGuard`.
 *
 * ---
 * QUYỀN LUÔN ĐƯỢC TRA LẠI TỪ DATABASE, KHÔNG ĐỌC TỪ TOKEN
 *
 * Đây là điểm quan trọng nhất của file này. Ký quyền vào JWT thì sửa phân quyền
 * không có tác dụng cho tới khi token hết hạn — người vừa bị tước quyền vẫn
 * thao tác thêm được 15 phút nữa, đúng lúc mà bạn cần chặn họ NGAY.
 *
 * Cái giá là một lần đọc thêm ở mỗi request có yêu cầu quyền, và
 * `PermissionService` đã cache lại (Redis nếu có, RAM nếu không) nên gần như
 * không chạm database.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Không khai quyền = endpoint chỉ cần đăng nhập. Việc CÓ cần đăng nhập hay
    // không đã do `JwtAuthGuard` quyết định.
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.user?.sub;

    // Endpoint vừa `@Public()` vừa `@RequirePermissions()` là một mâu thuẫn —
    // nhưng nó xảy ra khi ai đó copy nhầm decorator. Từ chối là an toàn.
    if (!userId) throw new ForbiddenException("Bạn không có quyền thực hiện thao tác này");

    const mode =
      this.reflector.getAllAndOverride<PermissionMode>(PERMISSIONS_MODE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? "all";

    const allowed =
      mode === "any"
        ? await this.permissions.canAny(userId, required)
        : await this.permissions.canAll(userId, required);

    if (!allowed) {
      // Cố ý KHÔNG nói thiếu quyền nào: đó là bản đồ hệ thống phân quyền, miễn
      // phí cho người đang dò. Người dùng thật thì hỏi quản trị viên.
      throw new ForbiddenException("Bạn không có quyền thực hiện thao tác này");
    }

    return true;
  }
}
