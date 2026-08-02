import { z } from "zod";
import { userSchema } from "./user";

export const loginSchema = z.object({
  email: z.string().email("Email không hợp lệ"),
  password: z.string().min(6, "Mật khẩu phải có ít nhất 6 ký tự"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  email: z.string().email("Email không hợp lệ"),
  password: z.string().min(6, "Mật khẩu phải có ít nhất 6 ký tự"),
  name: z.string().min(1, "Tên không được để trống").optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const authResponseSchema = z.object({
  accessToken: z.string(),
  user: userSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;
