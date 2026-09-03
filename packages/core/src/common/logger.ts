import { isProduction } from "../config/env";
import { captureException } from "./observability";

/**
 * Log JSON một dòng: đọc được bằng mắt, và parse được bởi Loki/Datadog/
 * CloudWatch mà không cần cấu hình gì thêm.
 *
 * Cố ý KHÔNG dùng Nest Logger: `packages/core` phải chạy được ở cả apps/api
 * (NestJS), apps/worker (Node thuần) và script seed. Phụ thuộc vào một
 * framework ở tầng này là tự khoá mình vào nó.
 */

type LogLevel = "debug" | "info" | "warn" | "error";
type LogContext = Record<string, unknown>;

/**
 * Key có tên nằm trong danh sách này bị che trước khi ghi.
 *
 * Đây không phải chuyện lịch sự: log thường được đẩy sang dịch vụ bên thứ ba
 * và giữ nhiều tháng. Một dòng log chứa mật khẩu là một lần rò rỉ, dù mã nguồn
 * không có lỗi nào.
 */
const REDACTED_KEYS = new Set([
  "password",
  "newpassword",
  "currentpassword",
  "token",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "secret",
  "clientsecret",
  "authorization",
  "cookie",
  "fcmtoken",
]);

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = REDACTED_KEYS.has(key.toLowerCase()) ? "[REDACTED]" : redact(item, depth + 1);
  }
  return output;
}

function serializeError(error: unknown) {
  if (!(error instanceof Error)) return { error: String(error) };
  return {
    error: {
      name: error.name,
      message: error.message,
      // Stack chỉ có ích khi debug; trên production nó là rác log và lộ đường dẫn.
      ...(isProduction ? {} : { stack: error.stack }),
    },
  };
}

function emit(level: LogLevel, message: string, context?: LogContext) {
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    message,
    ...(context ? (redact(context) as LogContext) : {}),
  });

  /* eslint-disable no-console */
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  // Đây là điểm ghi log DUY NHẤT của ứng dụng nên nó được phép dùng
  // console.log — chỗ khác thì không.
  else console.log(line);
  /* eslint-enable no-console */
}

export const logger = {
  debug(message: string, context?: LogContext) {
    if (!isProduction) emit("debug", message, context);
  },
  info(message: string, context?: LogContext) {
    emit("info", message, context);
  },
  warn(message: string, context?: LogContext) {
    emit("warn", message, context);
  },
  error(message: string, error?: unknown, context?: LogContext) {
    emit("error", message, { ...context, ...(error === undefined ? {} : serializeError(error)) });

    /*
     * Đẩy luôn ra hệ thống giám sát.
     *
     * Đặt ở ĐÂY chứ không bắt từng nơi gọi tự nhớ: `logger.error` đã là điểm
     * duy nhất mà mọi lỗi đi qua, nên nối vào đây là phủ được toàn bộ ứng dụng
     * bằng một dòng — thay vì rải `Sentry.captureException` khắp nơi rồi quên
     * vài chỗ. Chưa cắm nhà cung cấp thì đây là hàm rỗng, không tốn gì.
     */
    captureException(error ?? new Error(message), { message, ...context });
  },
};
