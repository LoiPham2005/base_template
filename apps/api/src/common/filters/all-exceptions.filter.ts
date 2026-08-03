import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { FastifyReply } from "fastify";
import { UserAlreadyExistsError, InvalidCredentialsError, UserNotFoundError } from "@repo/core";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = "INTERNAL_SERVER_ERROR";
    let message = "Đã xảy ra lỗi máy chủ";
    let details: unknown = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse() as
        string | { message?: string; error?: string; errors?: unknown; details?: unknown };

      if (typeof res === "object" && res !== null) {
        message = res.message || exception.message;
        code = res.error || exception.name;
        details = res.errors || res.details || null;
      } else {
        message = exception.message;
        code = exception.name;
      }
    } else if (exception instanceof UserAlreadyExistsError) {
      status = HttpStatus.CONFLICT;
      code = "USER_ALREADY_EXISTS";
      message = exception.message;
    } else if (exception instanceof InvalidCredentialsError) {
      status = HttpStatus.UNAUTHORIZED;
      code = "INVALID_CREDENTIALS";
      message = exception.message;
    } else if (exception instanceof UserNotFoundError) {
      status = HttpStatus.NOT_FOUND;
      code = "USER_NOT_FOUND";
      message = exception.message;
    }
    // Cố ý KHÔNG có nhánh `exception instanceof Error` đọc `exception.message`.
    //
    // Lỗi chưa được phân loại là lỗi ta chưa lường trước, nên nội dung của nó
    // hoàn toàn không kiểm soát được: thông điệp của Prisma có kèm chuỗi kết
    // nối database, lỗi hệ thống tệp có kèm đường dẫn tuyệt đối trên máy chủ.
    // Những thứ đó chỉ được đi vào log, không được trả về client — client chỉ
    // nhận thông điệp chung 500 đã đặt ở trên.

    if (status >= 500) {
      // Thông điệp thật của lỗi chỉ tồn tại ở đây, trong log máy chủ.
      const raw = exception instanceof Error ? exception.message : String(exception);
      this.logger.error(`[${code}] ${raw}`, exception instanceof Error ? exception.stack : "");
    } else {
      this.logger.warn(`[${code}] ${message}`);
    }

    response.status(status).send({
      success: false,
      error: {
        code,
        message,
        details,
      },
      timestamp: new Date().toISOString(),
    });
  }
}
