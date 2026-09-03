import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RATE_LIMITS, rateLimit, type RateLimitScope } from "@repo/core";
import type { FastifyReply } from "fastify";
import { RATE_LIMIT_KEY } from "../decorators/rate-limit.decorator";
import { clientIp } from "../request";
import { TooManyRequestsException } from "../filters/api-exceptions";

/**
 * Rate limit RIÊNG cho endpoint có `@RateLimit(scope)`.
 *
 * ---
 * VÌ SAO KHÔNG DÙNG `@nestjs/throttler` CHO NHỮNG ENDPOINT NÀY
 *
 * Throttler đã chạy toàn cục và làm tốt việc của nó: một ngưỡng thô cho mọi
 * endpoint. Nhưng nó lưu bộ đếm TRONG RAM của tiến trình, nên chạy 2 replica là
 * ngưỡng thực tế nhân đôi, và mỗi lần deploy là bộ đếm về 0.
 *
 * Với `/auth/login` thì điều đó không chấp nhận được — đó chính là endpoint mà
 * người ta dò. Guard này dùng store của `@repo/core`, vốn chạy trên Redis dùng
 * chung khi có `REDIS_URL`.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const scope = this.reflector.getAllAndOverride<RateLimitScope>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!scope) return true;

    const http = context.switchToHttp();
    const request = http.getRequest();
    const options = RATE_LIMITS[scope];

    const result = await rateLimit(`${scope}:${clientIp(request)}`, options);

    // Header chuẩn (RFC 9331 draft) để client tự biết còn bao nhiêu lượt thay
    // vì cứ bắn tới khi bị chặn.
    const reply = http.getResponse<FastifyReply>();
    void reply.header("RateLimit-Limit", String(result.limit));
    void reply.header("RateLimit-Remaining", String(result.remaining));

    if (!result.success) {
      void reply.header("Retry-After", String(result.retryAfterSeconds));
      throw new TooManyRequestsException(result.retryAfterSeconds);
    }

    return true;
  }
}
