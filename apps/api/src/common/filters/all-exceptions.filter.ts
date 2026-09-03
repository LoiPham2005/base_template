import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { ZodValidationException } from "nestjs-zod";
import {
  AccountBannedError,
  AccountLockedError,
  DomainError,
  RefreshTokenReuseError,
  logger,
  type DomainErrorCode,
} from "@repo/core";
import {
  AccountLockedException,
  TooManyRequestsException,
  type ApiErrorBody,
  type ApiErrorCode,
} from "./api-exceptions";
import { REQUEST_ID_HEADER, getRequestId } from "../request";
import { isProduction } from "../../env";

/**
 * Đổi MỌI exception thành một hình dạng JSON duy nhất.
 *
 * Thành công:  `{ "data": … }`   (xem `TransformInterceptor`)
 * Thất bại:    `{ "error": { "code", "message", "fields"?, "requestId"? } }`
 *
 * ---
 * VÌ SAO TẦNG NGHIỆP VỤ KHÔNG TỰ NÉM `HttpException`
 *
 * `packages/core` không được biết gì về HTTP: cùng một `UserNotFoundError` có
 * thể tới từ REST API (→ 404), từ job nền (→ ghi log rồi bỏ qua), hoặc từ
 * script CLI (→ in ra rồi thoát). Việc ánh xạ sang mã HTTP nằm gọn ở đây.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  /** Lỗi nghiệp vụ → mã HTTP. Bảng này là toàn bộ phần "dịch" giữa hai tầng. */
  private static readonly DOMAIN_STATUS: Record<DomainErrorCode, number> = {
    VALIDATION_ERROR: HttpStatus.UNPROCESSABLE_ENTITY,
    UNAUTHENTICATED: HttpStatus.UNAUTHORIZED,
    FORBIDDEN: HttpStatus.FORBIDDEN,
    NOT_FOUND: HttpStatus.NOT_FOUND,
    CONFLICT: HttpStatus.CONFLICT,
    ACCOUNT_BANNED: HttpStatus.FORBIDDEN,
    ACCOUNT_LOCKED: HttpStatus.LOCKED,
    RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
    // 502: lỗi nằm ở nhà cung cấp bên ngoài, không phải ở request của client.
    PROVIDER_ERROR: HttpStatus.BAD_GATEWAY,
  };

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    const requestId = getRequestId(request);

    const { status, body } = this.translate(exception, request, requestId);

    void reply.status(status).header(REQUEST_ID_HEADER, requestId).send(body);
  }

  private translate(
    exception: unknown,
    request: FastifyRequest,
    requestId: string,
  ): { status: number; body: ApiErrorBody } {
    const build = (
      status: number,
      code: ApiErrorCode,
      message: string,
      fields?: Record<string, string[]>,
    ) => ({
      status,
      body: {
        error: { code, message, ...(fields ? { fields } : {}), requestId },
      } satisfies ApiErrorBody,
    });

    // --- Lỗi nghiệp vụ từ @repo/core ---------------------------------------
    if (exception instanceof DomainError) {
      // Token đã thu hồi được dùng lại là dấu hiệu tấn công, không phải lỗi
      // thường — phải nhìn thấy được trong log dù response chỉ là 401 khô khan.
      if (exception instanceof RefreshTokenReuseError) {
        logger.warn("Phát hiện refresh token bị dùng lại — đã huỷ toàn bộ phiên", {
          userId: exception.userId,
          requestId,
        });
      }

      if (exception instanceof AccountLockedError || exception instanceof AccountBannedError) {
        logger.info("Từ chối đăng nhập", { reason: exception.name, requestId });
      }

      return build(
        AllExceptionsFilter.DOMAIN_STATUS[exception.code],
        exception.code,
        exception.message,
        exception.fields,
      );
    }

    /*
     * --- Lỗi validate của Zod ---------------------------------------------
     *
     * Hai đường vào:
     *
     *   - `ZodValidationException` do `ZodValidationPipe` ném khi body/query
     *     không hợp lệ. Phải gọi `getZodError()` để lấy chi tiết — thông điệp
     *     mặc định của nó chỉ là "Validation failed", tức là client biết mình
     *     sai nhưng không biết sai ở ĐÂU.
     *   - `ZodError` trần, khi service tự `parse` (ví dụ đọc dữ liệu từ bên thứ
     *     ba).
     *
     * Cả hai đều thành 422 kèm `fields`, để giao diện hiển thị lỗi ngay dưới
     * đúng ô nhập.
     */
    const zodError =
      exception instanceof ZodValidationException
        ? exception.getZodError()
        : exception instanceof ZodError
          ? exception
          : null;

    if (zodError instanceof ZodError) {
      const fields: Record<string, string[]> = {};
      for (const issue of zodError.issues) {
        // Đường dẫn rỗng = lỗi ở cấp object (thường do `.refine()` trên cả
        // schema). Gom vào khoá `_` để client vẫn hiển thị được.
        const key = issue.path.join(".") || "_";
        (fields[key] ??= []).push(issue.message);
      }

      return build(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "VALIDATION_ERROR",
        "Dữ liệu gửi lên không hợp lệ",
        fields,
      );
    }

    // --- Exception của NestJS ----------------------------------------------
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();

      // `ZodValidationPipe` và `ValidationPipe` nhét chi tiết vào `message` dạng
      // mảng. Giữ nguyên chúng thay vì rút gọn thành một câu chung chung.
      const detail =
        typeof response === "object" && response !== null
          ? (response as { message?: string | string[] }).message
          : undefined;

      const fields = Array.isArray(detail) ? { _: detail } : undefined;
      const message = Array.isArray(detail)
        ? "Dữ liệu gửi lên không hợp lệ"
        : (detail ?? exception.message);

      if (exception instanceof TooManyRequestsException) {
        return build(status, "RATE_LIMITED", message);
      }
      if (exception instanceof AccountLockedException) {
        return build(status, "ACCOUNT_LOCKED", message);
      }

      return build(status, AllExceptionsFilter.statusToCode(status), message, fields);
    }

    // --- Mọi thứ còn lại ---------------------------------------------------
    // Đây là lỗi KHÔNG lường trước. Ghi đầy đủ vào log, và trả ra ngoài một
    // câu chung chung: thông điệp gốc có thể chứa tên bảng, câu truy vấn, hoặc
    // đường dẫn trên máy chủ.
    logger.error("Lỗi không xử lý được", exception, {
      requestId,
      method: request.method,
      url: request.url,
    });

    return build(
      HttpStatus.INTERNAL_SERVER_ERROR,
      "INTERNAL_ERROR",
      isProduction
        ? "Lỗi máy chủ. Vui lòng thử lại."
        : `Lỗi máy chủ: ${exception instanceof Error ? exception.message : String(exception)}`,
    );
  }

  private static statusToCode(status: number): ApiErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return "VALIDATION_ERROR";
      case HttpStatus.UNAUTHORIZED:
        return "UNAUTHENTICATED";
      case HttpStatus.FORBIDDEN:
        return "FORBIDDEN";
      case HttpStatus.NOT_FOUND:
        return "NOT_FOUND";
      case HttpStatus.CONFLICT:
        return "CONFLICT";
      case HttpStatus.LOCKED:
        return "ACCOUNT_LOCKED";
      case HttpStatus.TOO_MANY_REQUESTS:
        return "RATE_LIMITED";
      default:
        return status >= 500 ? "INTERNAL_ERROR" : "VALIDATION_ERROR";
    }
  }
}
