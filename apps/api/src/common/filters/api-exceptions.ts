import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * Mã lỗi trong response. Đây là HỢP ĐỒNG với client.
 *
 * Client (Flutter/web) nên `switch` theo `code`, KHÔNG theo `message`: message
 * để hiển thị cho người dùng và có thể đổi lời văn bất cứ lúc nào, còn code thì
 * không. Client so theo message sẽ hỏng ngay lần đầu ai đó sửa chính tả.
 */
export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "ACCOUNT_BANNED"
  | "ACCOUNT_LOCKED"
  | "PROVIDER_ERROR"
  | "INTERNAL_ERROR";

export type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
    /** Lỗi theo từng trường, để hiển thị ngay dưới ô nhập tương ứng. */
    fields?: Record<string, string[]>;
    /** Mã định danh request — người dùng báo lỗi kèm mã này là tra ra đúng dòng log. */
    requestId?: string;
  };
};

/**
 * 429 kèm `Retry-After`.
 *
 * NestJS không có sẵn exception cho mã này, và `HttpException` trần thì bị
 * filter phân loại thành `INTERNAL_ERROR`.
 */
export class TooManyRequestsException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super(
      `Quá nhiều yêu cầu. Thử lại sau ${retryAfterSeconds} giây.`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/**
 * 423 Locked.
 *
 * KHÔNG phải 401 (sai thông tin đăng nhập) hay 429 (dồn dập request): mật khẩu
 * ĐÚNG nhưng tài khoản đang tạm khoá do trước đó sai quá nhiều lần. Client cần
 * phân biệt để hiển thị đúng thông điệp.
 */
export class AccountLockedException extends HttpException {
  constructor(message: string) {
    super(message, HttpStatus.LOCKED);
  }
}
