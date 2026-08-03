import { z } from "zod";

// Single source of truth for the "shape of a user". Used by:
// - react-hook-form on the web (zodResolver)
// - NestJS DTO validation (nestjs-zod) for the mobile API
// - packages/core as the input/output type for UserService
// Change a field here and every layer catches the mismatch at compile time.

/**
 * Yêu cầu tối thiểu về mật khẩu.
 *
 * Sàn 8 ký tự theo NIST SP 800-63B (bản cũ để 6). Cố ý KHÔNG ép chữ hoa hay ký
 * tự đặc biệt: những luật đó đẩy người dùng tới `Password1!` chứ không làm mật
 * khẩu mạnh hơn — độ dài mới là thứ có giá trị.
 */
export const passwordSchema = z
  .string()
  .min(8, "Mật khẩu tối thiểu 8 ký tự")
  .max(128, "Mật khẩu tối đa 128 ký tự");

/**
 * Dùng cho ADMIN tạo tài khoản hộ người khác.
 *
 * `password` là TUỲ CHỌN, và đây là bản sửa lỗi: trước đây trường này bắt buộc,
 * trong khi form trên web chỉ gửi email + name — nên mọi lần submit đều bị Zod
 * chặn với `password: Required`, mà form lại không có ô password để hiển thị
 * lỗi đó. Form tạo user chưa từng hoạt động.
 *
 * Bỏ trống password nghĩa là tài khoản chưa đặt mật khẩu (cột `password` = null,
 * không phải chuỗi rỗng) và chưa đăng nhập bằng mật khẩu được.
 */
export const createUserSchema = z.object({
  email: z.string().email("Email không hợp lệ"),
  password: passwordSchema.optional(),
  name: z.string().min(1, "Tên không được để trống").max(100).optional(),
  // Chỉ ADMIN gọi được endpoint nhận schema này (xem UserController).
  role: z.enum(["USER", "ADMIN"]).optional(),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().nullable(),
  role: z.enum(["USER", "ADMIN"]),
  // coerce: apps/api serializes this as an ISO string over JSON, while
  // packages/core (Prisma) hands back a real Date — this schema is used
  // to parse both.
  createdAt: z.coerce.date(),
});
export type User = z.infer<typeof userSchema>;
