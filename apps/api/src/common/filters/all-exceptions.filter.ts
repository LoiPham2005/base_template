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
      const res = exception.getResponse() as any;

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
    } else if (exception instanceof Error) {
      message = exception.message;
      code = exception.name;
    }

    if (status >= 500) {
      this.logger.error(`[${code}] ${message}`, (exception as Error)?.stack);
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
