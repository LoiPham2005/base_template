import { z } from "zod";
import { loadEnvFiles } from "./load-env";

// Phải chạy TRƯỚC khi đọc `process.env` bên dưới.
loadEnvFiles();

/**
 * Biến môi trường của TẦNG NGHIỆP VỤ (packages/core).
 *
 * ---
 * VÌ SAO CÓ HAI FILE ENV
 *
 * File này giữ những gì `packages/core` cần: database, Redis, mail, kho tệp,
 * hạn token, OAuth. `apps/api/src/env.ts` giữ những gì RIÊNG của tiến trình
 * HTTP: cổng, CORS, khoá ký JWT, bật/tắt Swagger.
 *
 * Chia như vậy vì `apps/worker` cũng import `@repo/core` nhưng KHÔNG có cổng
 * HTTP, không có CORS, không ký JWT. Gộp làm một thì worker bắt buộc phải khai
 * `JWT_SECRET` và `CORS_ORIGIN` chỉ để khởi động được — một thứ vô nghĩa mà
 * cuối cùng ai cũng điền bừa cho qua, và thế là mất luôn tác dụng của việc
 * validate.
 *
 * ---
 * VALIDATE MỘT LẦN LÚC LOAD MODULE
 *
 * Không có lớp này thì `DATABASE_URL` gõ sai chỉ lộ ra ở request đầu tiên chạm
 * database — thường là trên production, vài phút sau khi deploy.
 */

/**
 * Coi chuỗi RỖNG như "không khai báo".
 *
 * `.optional()` và `.default()` của Zod chỉ nhảy vào khi giá trị là
 * `undefined`, nhưng có ba đường rất phổ biến đưa chuỗi rỗng vào thay vì
 * `undefined`: dòng `MAIL_FROM=` bỏ trống trong `.env`, `ENV` trong Dockerfile
 * không được truyền giá trị, và `${BIEN:-}` trong docker-compose.
 *
 * Không có lớp này thì app chết lúc khởi động kèm thông báo gây hiểu lầm cho
 * một biến vốn là tuỳ chọn — và chỉ chết trên Docker/CI chứ không chết trên
 * máy dev, nên rất tốn thời gian truy.
 */
function optionalString<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => (value === "" ? undefined : value), schema);
}

/**
 * Cờ bật/tắt tiến trình phụ. CHỈ nhận `1` hoặc `0`, không nhận `true`/`false`.
 *
 * Vì chính biến này được `docker-compose.yml` dùng làm số bản sao:
 * `deploy: { replicas: ${QUEUE_ENABLED:-1} }`. Compose chỉ hiểu SỐ — đưa
 * `true` vào là nó dừng ngay với `strconv.Atoi: parsing "true"`.
 *
 * Dùng CHUNG một biến cho cả app lẫn compose là có chủ đích. Tách làm hai
 * (`QUEUE_ENABLED` cho app, `WORKER_REPLICAS` cho compose) thì sớm muộn hai bên
 * lệch nhau, và một chiều lệch diễn ra HOÀN TOÀN TRONG IM LẶNG: app vẫn đẩy
 * job vào Redis trong khi không có worker nào chạy.
 */
function featureFlag(defaultValue: boolean) {
  return z.preprocess(
    (value) => {
      if (value === undefined || value === "") return defaultValue;
      if (value === "1") return true;
      if (value === "0") return false;
      // Trả nguyên giá trị lạ để Zod báo lỗi kèm TÊN BIẾN.
      return value;
    },
    z.boolean({
      invalid_type_error:
        "chỉ nhận 1 (bật) hoặc 0 (tắt) — docker-compose dùng chính biến này làm số replicas nên true/false không hợp lệ",
    }),
  );
}

const coreEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL là bắt buộc")
    .refine(
      (value) => value.startsWith("postgresql://") || value.startsWith("postgres://"),
      "DATABASE_URL phải là chuỗi kết nối PostgreSQL (postgresql://...)",
    ),

  /**
   * URL công khai của ứng dụng — dùng dựng link trong email và redirect_uri
   * của OAuth.
   *
   * Không có giá trị mặc định `localhost`: một email đặt lại mật khẩu chứa
   * link localhost là email vô dụng, mà người dùng thì đã nhận rồi.
   */
  APP_URL: optionalString(z.string().url("APP_URL phải là URL tuyệt đối").optional()),

  /**
   * URL công khai của chính API. Dùng dựng `redirect_uri` cho OAuth.
   *
   * Bỏ trống thì lấy theo `APP_URL` — đúng khi web và API nằm sau CÙNG một tên
   * miền (reverse proxy chuyển tiếp `/api/*` sang API).
   *
   * ⚠️ BẮT BUỘC phải đặt khi API ở tên miền RIÊNG (`api.example.com` trong
   * `Caddyfile` mẫu). Không đặt thì `redirect_uri` trỏ vào tên miền web, nơi
   * không có route callback nào — và lỗi đó chỉ lộ ra khi có người bấm nút
   * "Đăng nhập bằng Google" thật.
   */
  API_PUBLIC_URL: optionalString(z.string().url("API_PUBLIC_URL phải là URL tuyệt đối").optional()),

  // --- Hạn của các loại token --------------------------------------------

  /**
   * Hạn access token. Ngắn có chủ đích: JWT đã ký thì KHÔNG thu hồi được, nên
   * thứ giới hạn thiệt hại khi lộ token chính là hạn của nó. Việc giữ đăng
   * nhập lâu dài do refresh token đảm nhiệm.
   */
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().max(1440).default(15),
  /** Hạn refresh token. Thu hồi được vì nó nằm trong database. */
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().max(365).default(30),
  /**
   * Hạn link xác thực email. Dài hơn hẳn link đặt lại mật khẩu vì mức thiệt
   * hại khác nhau: link xác thực bị lộ chỉ giúp kẻ khác xác nhận hộ một địa
   * chỉ, còn link đặt lại mật khẩu bị lộ là mất tài khoản.
   */
  EMAIL_VERIFICATION_TTL_HOURS: z.coerce.number().int().positive().max(168).default(24),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().max(1440).default(60),
  /** Hạn mã OTP gửi qua SMS. Rất ngắn — OTP chỉ có 6 chữ số. */
  PHONE_OTP_TTL_MINUTES: z.coerce.number().int().positive().max(60).default(5),

  // --- Chống brute-force theo TÀI KHOẢN ------------------------------------
  // Bổ sung cho rate-limit theo IP: rate-limit chặn một IP dò nhiều tài khoản,
  // cặp giá trị này chặn nhiều IP cùng dò một tài khoản.
  LOGIN_MAX_FAILED_ATTEMPTS: z.coerce.number().int().positive().max(20).default(5),
  LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().positive().max(1440).default(15),

  // --- Redis: cache, rate limit, hàng đợi ----------------------------------

  /**
   * Bỏ trống = cache và rate limit chạy trong RAM của từng tiến trình. Đủ cho
   * MỘT instance; từ instance thứ hai trở đi mỗi bản đếm riêng, nên ngưỡng
   * thực tế bị nhân lên theo số instance — và mỗi lần deploy là bộ đếm về 0.
   */
  REDIS_URL: optionalString(z.string().min(1).optional()),

  /**
   * Hàng đợi job nền (BullMQ + apps/worker).
   *
   * `0` = `enqueue()` chạy handler NGAY trong request. Việc vẫn xong đủ, chỉ
   * đổi CHỖ chạy — đổi lại là không cần Redis, không cần dựng worker.
   *
   * ⚠️ Cái mất khi tắt: THỬ LẠI TỰ ĐỘNG. Đang bật hàng đợi, một lần SMTP nghẽn
   * chỉ làm job lùi vài giây rồi chạy lại. Tắt đi thì lỗi đó bung thẳng ra
   * request — người dùng đăng ký hỏng vì máy chủ mail hắt hơi.
   */
  QUEUE_ENABLED: featureFlag(true),

  // --- Email ---------------------------------------------------------------

  /** Địa chỉ người gửi, ví dụ `"Hệ thống <no-reply@example.com>"`. */
  MAIL_FROM: optionalString(z.string().min(1).optional()),

  /**
   * Cấu hình SMTP. Thiếu `SMTP_HOST` thì mailer mặc định chỉ ghi ra log ở dev
   * và NÉM LỖI ở production — xem `infra/mailer.ts`.
   */
  SMTP_HOST: optionalString(z.string().min(1).optional()),
  SMTP_PORT: z.coerce.number().int().positive().max(65535).default(587),
  SMTP_SECURE: featureFlag(false),
  SMTP_USER: optionalString(z.string().min(1).optional()),
  SMTP_PASSWORD: optionalString(z.string().min(1).optional()),

  // --- Kho tệp (S3 / MinIO / R2) -------------------------------------------
  S3_ENDPOINT: optionalString(z.string().url().optional()),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: optionalString(z.string().min(1).optional()),
  S3_ACCESS_KEY_ID: optionalString(z.string().min(1).optional()),
  S3_SECRET_ACCESS_KEY: optionalString(z.string().min(1).optional()),
  /**
   * `true` với MinIO và một số nhà cung cấp trong nước (bucket nằm trong
   * đường dẫn thay vì tên miền con).
   */
  S3_FORCE_PATH_STYLE: featureFlag(false),
  /** Tên miền CDN đặt trước bucket, nếu có. */
  S3_PUBLIC_URL: optionalString(z.string().url().optional()),

  // --- OAuth ---------------------------------------------------------------
  // Mỗi provider độc lập: thiếu cặp CLIENT_ID/SECRET của provider nào thì
  // riêng provider đó báo "chưa cấu hình", không làm sập app.
  GOOGLE_CLIENT_ID: optionalString(z.string().min(1).optional()),
  GOOGLE_CLIENT_SECRET: optionalString(z.string().min(1).optional()),
  GITHUB_CLIENT_ID: optionalString(z.string().min(1).optional()),
  GITHUB_CLIENT_SECRET: optionalString(z.string().min(1).optional()),
  FACEBOOK_CLIENT_ID: optionalString(z.string().min(1).optional()),
  FACEBOOK_CLIENT_SECRET: optionalString(z.string().min(1).optional()),
  /**
   * Apple không dùng client secret tĩnh: secret là một JWT tự ký bằng private
   * key (.p8), hết hạn tối đa 6 tháng. Bốn biến này là nguyên liệu để tự sinh
   * JWT đó lúc chạy — xem `auth/oauth/apple-client-secret.ts`.
   */
  APPLE_CLIENT_ID: optionalString(z.string().min(1).optional()),
  APPLE_TEAM_ID: optionalString(z.string().min(1).optional()),
  APPLE_KEY_ID: optionalString(z.string().min(1).optional()),
  APPLE_PRIVATE_KEY: optionalString(z.string().min(1).optional()),

  // --- Tài khoản quản trị đầu tiên (dùng cho db:seed) ----------------------
  ADMIN_EMAIL: optionalString(z.string().email("ADMIN_EMAIL không hợp lệ").optional()),
  ADMIN_PASSWORD: optionalString(z.string().min(8, "ADMIN_PASSWORD tối thiểu 8 ký tự").optional()),
});

export type CoreEnv = z.infer<typeof coreEnvSchema>;

/**
 * Giá trị giả cho bước `docker build` / `next build`, nơi chưa có secret thật.
 * Đặt `SKIP_ENV_VALIDATION=1` để dùng.
 */
const buildTimePlaceholders: Partial<Record<keyof CoreEnv, string>> = {
  DATABASE_URL: "postgresql://build:build@localhost:5432/build",
};

function loadEnv(): CoreEnv {
  const source =
    process.env.SKIP_ENV_VALIDATION === "1"
      ? { ...buildTimePlaceholders, ...process.env }
      : process.env;

  const parsed = coreEnvSchema.safeParse(source);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");

    throw new Error(`Cấu hình môi trường không hợp lệ:\n${details}\n\nĐối chiếu với .env.example.`);
  }

  return parsed.data;
}

export const env = loadEnv();

export const isProduction = env.NODE_ENV === "production";
export const isDevelopment = env.NODE_ENV === "development";
export const isTest = env.NODE_ENV === "test";

/**
 * Dựng URL tuyệt đối trỏ về ứng dụng.
 *
 * Ném lỗi khi thiếu `APP_URL` thay vì đoán bừa `localhost` — xem lý do ở phần
 * khai báo biến.
 */
export function appUrl(path: string): string {
  if (!env.APP_URL) {
    throw new Error(
      "Thiếu APP_URL — không dựng được link tuyệt đối (email xác thực, callback OAuth). " +
        "Đặt biến này trong .env trước khi bật các luồng đó.",
    );
  }

  return new URL(path, env.APP_URL).toString();
}

/**
 * Dựng URL tuyệt đối trỏ về chính API này.
 *
 * Lùi về `APP_URL` khi chưa đặt `API_PUBLIC_URL` — xem ghi chú ở phần khai báo
 * biến để biết khi nào bắt buộc phải tách hai giá trị.
 */
export function apiUrl(path: string): string {
  const base = env.API_PUBLIC_URL ?? env.APP_URL;

  if (!base) {
    throw new Error(
      "Thiếu API_PUBLIC_URL (và cả APP_URL) — không dựng được redirect_uri cho OAuth.",
    );
  }

  return new URL(path, base).toString();
}
