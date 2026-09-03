import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { logger } from "@repo/core";
import type { FastifyReply } from "fastify";
import { tap, type Observable } from "rxjs";
import { REQUEST_ID_HEADER, clientIp, getRequestId } from "../request";
import type { AuthenticatedRequest } from "../decorators/current-user.decorator";

/**
 * Ghi một dòng log cho mỗi request, kèm mã định danh request.
 *
 * ---
 * VÌ SAO CẦN MÃ ĐỊNH DANH
 *
 * Log JSON một dòng đã đọc được bằng Loki/Datadog. Nhưng khi một request sinh
 * ra nhiều dòng — rate limit chạm ngưỡng, service ném lỗi, filter ghi lỗi cuối
 * cùng — thì không có gì cho biết ba dòng đó thuộc CÙNG MỘT request hay ba
 * request khác nhau xảy ra gần nhau. Trên production lúc đang có sự cố, đó đúng
 * là câu hỏi cần trả lời đầu tiên.
 *
 * Mã cũng được trả về trong header `X-Request-Id`, nên người dùng báo lỗi kèm
 * mã đó là tra ra ngay đúng dòng log.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const reply = http.getResponse<FastifyReply>();

    const requestId = getRequestId(request);
    void reply.header(REQUEST_ID_HEADER, requestId);

    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          logger.info("request", {
            requestId,
            method: request.method,
            url: request.url,
            status: reply.statusCode,
            durationMs: Date.now() - startedAt,
            userId: request.user?.sub,
            ip: clientIp(request),
          });
        },
        // Nhánh lỗi CHỈ ghi tóm tắt: chi tiết đã được `AllExceptionsFilter` ghi
        // đầy đủ. Ghi cả hai nơi là mỗi lỗi thành hai dòng, và khi dò log thì
        // hai dòng gần giống nhau còn khó đọc hơn một dòng.
        error: () => {
          logger.warn("request lỗi", {
            requestId,
            method: request.method,
            url: request.url,
            durationMs: Date.now() - startedAt,
            userId: request.user?.sub,
          });
        },
      }),
    );
  }
}
