import { createZodDto } from "nestjs-zod";
import {
  assignRolesSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  updateProfileSchema,
  verifyEmailSchema,
} from "@repo/contracts";

/**
 * DTO chỉ là lớp vỏ mỏng quanh Zod schema trong `@repo/contracts`.
 *
 * Cùng một schema được `react-hook-form` bên `apps/web` dùng để validate form.
 * Nhờ vậy web và mobile KHÔNG THỂ hiểu khác nhau về "một request đăng ký hợp
 * lệ" — và cũng không có chuyện web siết luật chặt hơn còn API vẫn nhận, tức là
 * gọi thẳng API là lách được.
 *
 * `createZodDto` còn sinh luôn schema OpenAPI, nên Swagger tự khớp với luật
 * validate thật thay vì với một bản mô tả viết tay dễ lỗi thời.
 */
export class LoginDto extends createZodDto(loginSchema) {}
export class RegisterDto extends createZodDto(registerSchema) {}
export class RefreshDto extends createZodDto(refreshSchema) {}
export class ForgotPasswordDto extends createZodDto(forgotPasswordSchema) {}
export class ResetPasswordDto extends createZodDto(resetPasswordSchema) {}
export class ChangePasswordDto extends createZodDto(changePasswordSchema) {}
export class VerifyEmailDto extends createZodDto(verifyEmailSchema) {}
export class ResendVerificationDto extends createZodDto(resendVerificationSchema) {}
export class UpdateProfileDto extends createZodDto(updateProfileSchema) {}
export class AssignRolesDto extends createZodDto(assignRolesSchema) {}
