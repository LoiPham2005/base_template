import { isProduction } from "../config/env";

/**
 * Điểm nối để đẩy lỗi ra hệ thống giám sát bên ngoài (Sentry, GlitchTip,
 * OpenTelemetry…).
 *
 * ---
 * VÌ SAO KHÔNG CẮM SẴN SENTRY
 *
 * Đây là bộ khung dùng cho nhiều dự án, mỗi dự án bị ràng buộc khác nhau: có
 * nơi đã mua Sentry, có nơi tự dựng GlitchTip, có nơi khách yêu cầu dữ liệu
 * không rời khỏi Việt Nam. Cắm cứng một nhà cung cấp chỉ tạo ra việc phải gỡ
 * ra, cộng thêm một dependency nặng mà phần lớn dự án không dùng.
 *
 * ---
 * VÌ SAO BẢN MẶC ĐỊNH IM LẶNG (khác hẳn mailer)
 *
 * Lỗi đã được ghi vào log JSON của ứng dụng rồi, nên không có gì bị mất. Chưa
 * cắm Sentry chỉ nghĩa là phải đọc log thủ công — bất tiện, không phải mất dữ
 * liệu. Và không hệ thống nào nên sập chỉ vì dịch vụ giám sát của nó chết.
 *
 * ---
 * CẮM NHÀ CUNG CẤP THẬT — trong `apps/api/src/main.ts`:
 *
 *   import * as Sentry from "@sentry/node";
 *   setErrorReporter({
 *     captureException: (error, context) => Sentry.captureException(error, { extra: context }),
 *     setUser: (user) => Sentry.setUser(user),
 *   });
 */

export type ErrorContext = Record<string, unknown>;

export type ErrorReporter = {
  captureException(error: unknown, context?: ErrorContext): void;
  /**
   * ⚠️ CHỈ truyền id và email. Đừng gửi tên, số điện thoại hay dữ liệu cá nhân
   * nào khác sang dịch vụ bên thứ ba — đó là dữ liệu của khách hàng bạn.
   */
  setUser?(user: { id: string; email?: string } | null): void;
};

const noopReporter: ErrorReporter = {
  captureException() {
    // Cố ý không làm gì. Lỗi đã nằm trong log ứng dụng.
  },
};

let currentReporter: ErrorReporter = noopReporter;

/** Gọi một lần lúc khởi động ứng dụng. */
export function setErrorReporter(reporter: ErrorReporter): void {
  currentReporter = reporter;
}

/**
 * KHÔNG BAO GIỜ ném lỗi ra ngoài, kể cả khi chính reporter hỏng — một dịch vụ
 * giám sát chết không được phép kéo theo ứng dụng.
 */
export function captureException(error: unknown, context?: ErrorContext): void {
  try {
    currentReporter.captureException(error, context);
  } catch {
    // Không dùng `logger` ở đây: logger là thứ GỌI hàm này, nên gọi ngược lại
    // sẽ tạo vòng lặp vô hạn khi cả hai cùng hỏng.
    if (!isProduction) {
      // eslint-disable-next-line no-console
      console.error("[observability] reporter ném lỗi, đã bỏ qua");
    }
  }
}

export function setObservedUser(user: { id: string; email?: string } | null): void {
  try {
    currentReporter.setUser?.(user);
  } catch {
    // Cùng lý do trên.
  }
}
