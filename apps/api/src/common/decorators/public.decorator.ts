import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";

/**
 * Đánh dấu endpoint KHÔNG cần đăng nhập.
 *
 * ---
 * VÌ SAO MẶC ĐỊNH LÀ "PHẢI ĐĂNG NHẬP", VÀ NGOẠI LỆ MỚI PHẢI KHAI
 *
 * `JwtAuthGuard` được đăng ký toàn cục (`APP_GUARD`), nên mọi endpoint mặc
 * định đều yêu cầu token. Đây là chiều an toàn: quên đánh dấu thì endpoint bị
 * KHOÁ — lỗi lộ ra ngay lần gọi đầu tiên.
 *
 * Chiều ngược lại (mặc định mở, phải nhớ gắn guard) hỏng trong im lặng: quên
 * một chỗ là endpoint đó công khai với cả Internet, và không có gì báo cho bạn
 * biết.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
