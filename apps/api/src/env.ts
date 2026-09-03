import { z } from "zod";
import { loadEnvFiles } from "@repo/core";

// Đọc `.env` ở gốc workspace (và `.env` riêng của app nếu có) — xem ghi chú
// trong `packages/core/src/config/load-env.ts` để hiểu vì sao không dùng thẳng
// `dotenv/config`.
loadEnvFiles();

/**
 * Biến môi trường RIÊNG của tiến trình HTTP.
 *
 * Những gì thuộc tầng nghiệp vụ (database, Redis, mail, kho tệp, hạn token,
 * OAuth) nằm ở `packages/core/src/config/env.ts` và dùng chung với
 * `apps/worker`. Ở đây chỉ còn thứ mà một tiến trình phục vụ HTTP mới cần.
 *
 * Xem ghi chú đầu file env của core để hiểu vì sao tách làm hai.
 */

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3001),

  /**
   * KHÔNG có giá trị mặc định — đây là chủ ý.
   *
   * Một mặc định như `"change-me-in-production"` nằm công khai trong mã nguồn
   * nghĩa là mọi bản deploy quên set biến này đều ký JWT bằng một khoá ai cũng
   * biết — tức là bất kỳ ai cũng tự tạo được token ADMIN hợp lệ cho hệ thống
   * của bạn.
   *
   * Thà app không khởi động được, còn hơn khởi động với khoá công khai.
   */
  JWT_SECRET: z
    .string({ required_error: "JWT_SECRET là bắt buộc — sinh bằng: openssl rand -base64 48" })
    .min(32, "JWT_SECRET phải dài tối thiểu 32 ký tự"),

  /**
   * Danh sách origin, phân tách bằng dấu phẩy.
   *
   * `*` chỉ chấp nhận được NGOÀI production: wildcard đi kèm `credentials: true`
   * là cấu hình mâu thuẫn — trình duyệt từ chối, và nếu lách được thì mọi
   * website đều đọc được response kèm thông tin đăng nhập của người dùng.
   */
  CORS_ORIGIN: z.string().default("*"),

  /**
   * Bật Swagger UI tại `/docs`.
   *
   * Mặc định TẮT trên production: một trang công khai liệt kê sẵn mọi endpoint,
   * mọi tham số và mọi mã lỗi tiện cho người dò hệ thống hơn là cho bạn. Bật
   * lại được bằng `ENABLE_SWAGGER=true` khi bạn thật sự muốn (API công khai có
   * tài liệu, hoặc đã đặt sau xác thực ở tầng proxy).
   */
  ENABLE_SWAGGER: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),

  /**
   * Ngưỡng rate limit chung, áp cho MỌI endpoint (`ThrottlerGuard`).
   *
   * Đây là lớp bảo vệ thô theo IP. Các endpoint nhạy cảm (login, quên mật khẩu)
   * còn có ngưỡng riêng chặt hơn nhiều — xem `RATE_LIMITS` trong `@repo/core`.
   */
  THROTTLE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(120),

  /**
   * Kích thước body tối đa (byte). Mặc định 1MB.
   *
   * Cố tình nhỏ: API này nhận JSON, không nhận file — tệp đi thẳng lên S3 bằng
   * presigned URL (xem `files/`). Nới rộng chỉ để "phòng khi cần" là mở một
   * đường tấn công rẻ tiền: gửi vài chục request với body khổng lồ.
   */
  BODY_LIMIT_BYTES: z.coerce.number().int().positive().default(1_048_576),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Cấu hình môi trường không hợp lệ:\n${details}`);
  }

  const parsed = result.data;

  if (parsed.NODE_ENV === "production" && parsed.CORS_ORIGIN === "*") {
    throw new Error(
      "CORS_ORIGIN không được để `*` trên production. " +
        'Khai báo domain cụ thể, ví dụ: CORS_ORIGIN="https://app.example.com"',
    );
  }

  return parsed;
}

export const env = validateEnv();

export const isProduction = env.NODE_ENV === "production";
