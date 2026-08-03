// Nạp .env trước khi đọc process.env. Không có dòng này thì app chỉ thấy biến
// được export sẵn trong shell — bản trước "chạy được" là nhờ JWT_SECRET và
// CORS_ORIGIN đều có giá trị mặc định, tức là chưa bao giờ thật sự đọc .env.
// Trên CI và production, biến đã có sẵn trong môi trường nên dòng này không
// làm gì cả; nó chỉ phục vụ máy dev.
import "dotenv/config";
import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3001),

  DATABASE_URL: z.string({ required_error: "DATABASE_URL là bắt buộc" }).min(1),

  /**
   * KHÔNG có giá trị mặc định — đây là lỗ hổng đã được vá.
   *
   * Bản trước dùng `.default("super-secret-jwt-key-change-in-production")`, và
   * chuỗi đó nằm công khai cả trong mã nguồn lẫn .env.example. Mọi bản deploy
   * quên set biến này đều ký JWT bằng một khoá ai cũng biết — nghĩa là bất kỳ
   * ai cũng tự tạo được token ADMIN hợp lệ cho hệ thống của bạn.
   *
   * Thà app không khởi động được, còn hơn khởi động với khoá công khai.
   */
  JWT_SECRET: z
    .string({ required_error: "JWT_SECRET là bắt buộc — sinh bằng: openssl rand -base64 48" })
    .min(32, "JWT_SECRET phải dài tối thiểu 32 ký tự"),

  JWT_EXPIRES_IN: z.string().default("7d"),

  /**
   * Danh sách origin, phân tách bằng dấu phẩy. `*` chỉ chấp nhận được ngoài
   * production: wildcard đi kèm `credentials: true` là cấu hình mâu thuẫn —
   * trình duyệt từ chối, và nếu lách được thì mọi website đều đọc được
   * response kèm thông tin đăng nhập của người dùng.
   */
  CORS_ORIGIN: z.string().default("*"),

  /** Bật Swagger UI. Mặc định TẮT trên production. */
  ENABLE_SWAGGER: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
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
