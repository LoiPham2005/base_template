import { z } from "zod";
import { passwordSchema, userSchema } from "./user";

export const loginSchema = z.object({
  email: z.string().email("Email không hợp lệ"),
  // Đăng nhập chỉ cần "có nhập gì đó". Áp luật độ dài ở đây là vô nghĩa với
  // tài khoản cũ đặt mật khẩu từ trước khi luật đổi — và nó còn tiết lộ luật
  // mật khẩu cho người đang dò.
  password: z.string().min(1, "Vui lòng nhập mật khẩu"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  email: z.string().email("Email không hợp lệ"),
  password: passwordSchema,
  name: z.string().min(1, "Tên không được để trống").max(100).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const authResponseSchema = z.object({
  accessToken: z.string(),
  user: userSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;
