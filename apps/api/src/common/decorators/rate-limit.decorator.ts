import { SetMetadata } from "@nestjs/common";
import type { RateLimitScope } from "@repo/core";

export const RATE_LIMIT_KEY = "rateLimitScope";

/**
 * Áp ngưỡng rate limit RIÊNG (chặt hơn ngưỡng chung) cho một endpoint.
 *
 * Ngưỡng cụ thể nằm trong `RATE_LIMITS` của `@repo/core` chứ không phải ở đây:
 * web, mobile và mọi cửa vào khác phải chịu chung một chính sách, nên con số
 * chỉ được tồn tại ở đúng một chỗ.
 *
 * @example
 * @RateLimit("login")
 * @Post("login") login(…) { … }
 */
export const RateLimit = (scope: RateLimitScope) => SetMetadata(RATE_LIMIT_KEY, scope);
