import { z } from "zod";
import { emptyToUndefined } from "./common";

export const roleKeySchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(2, "Mã vai trò tối thiểu 2 ký tự")
  .max(40)
  // Viết HOA + gạch dưới là quy ước bắt buộc, không phải gợi ý: `role.key` bị
  // so sánh bằng chuỗi ở nhiều nơi, và `"Admin"` vs `"ADMIN"` là hai vai trò
  // khác nhau nhìn từ database.
  .regex(/^[A-Z][A-Z0-9_]*$/, "Mã vai trò chỉ gồm CHỮ HOA, số và dấu gạch dưới");

export const createRoleSchema = z.object({
  key: roleKeySchema,
  name: z.string().trim().min(1, "Tên vai trò không được để trống").max(100),
  description: emptyToUndefined(z.string().max(255).optional()),
  permissions: z.array(z.string()).default([]),
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: emptyToUndefined(z.string().max(255).optional()),
  /**
   * Danh sách quyền THAY THẾ toàn bộ, không phải thêm vào.
   *
   * Chọn kiểu thay thế vì màn phân quyền là một bảng tick: gửi nguyên trạng
   * thái cuối cùng thì không có chỗ cho lệch pha giữa "quyền vừa bỏ tick" và
   * "quyền chưa bao giờ có". Bỏ trống field = không đụng tới phân quyền.
   */
  permissions: z.array(z.string()).optional(),
});
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

export const roleSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isSystem: z.boolean(),
  permissions: z.array(z.string()),
  /** Số người đang mang vai trò này — cảnh báo trước khi xoá. */
  userCount: z.number(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Role = z.infer<typeof roleSchema>;
