import { SetMetadata, applyDecorators } from "@nestjs/common";
import type { Permission } from "@repo/contracts";

export const PERMISSIONS_KEY = "requiredPermissions";
export const PERMISSIONS_MODE_KEY = "requiredPermissionsMode";

export type PermissionMode = "all" | "any";

/**
 * Yêu cầu người gọi có ĐỦ TẤT CẢ các quyền được liệt kê.
 *
 * ---
 * VÌ SAO KIỂM THEO QUYỀN, KHÔNG THEO VAI TRÒ
 *
 * `@RequireRoles("ADMIN")` phải sửa lại mỗi lần khách hàng thêm một vai trò
 * mới — mà thêm vai trò là việc họ làm trên giao diện, không cần deploy. Kiểm
 * theo QUYỀN thì câu hỏi trở thành "được làm hành động này không", và câu trả
 * lời đổi được lúc chạy mà không đụng tới mã nguồn.
 *
 * Tên quyền được TypeScript kiểm tra (kiểu `Permission`), nên gõ sai là lỗi
 * biên dịch chứ không phải một endpoint âm thầm không ai vào được.
 *
 * @example
 * @RequirePermissions("user:read")
 * @Get() list() { … }
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  applyDecorators(
    SetMetadata(PERMISSIONS_KEY, permissions),
    SetMetadata(PERMISSIONS_MODE_KEY, "all" satisfies PermissionMode),
  );

/**
 * Yêu cầu người gọi có ÍT NHẤT MỘT trong các quyền được liệt kê.
 *
 * Dùng cho endpoint phục vụ nhiều nhóm với lý do khác nhau — ví dụ trang tổng
 * quan mà cả người quản lý người dùng lẫn người xem nhật ký đều cần mở được.
 */
export const RequireAnyPermission = (...permissions: Permission[]) =>
  applyDecorators(
    SetMetadata(PERMISSIONS_KEY, permissions),
    SetMetadata(PERMISSIONS_MODE_KEY, "any" satisfies PermissionMode),
  );
