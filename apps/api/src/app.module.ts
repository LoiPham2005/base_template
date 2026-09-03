import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { ZodValidationPipe } from "nestjs-zod";
import { env } from "./env";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { RolesModule } from "./roles/roles.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { DevicesModule } from "./devices/devices.module";
import { AuditModule } from "./audit/audit.module";
import { FilesModule } from "./files/files.module";
import { HealthModule } from "./health/health.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { PermissionsGuard } from "./common/guards/permissions.guard";
import { RateLimitGuard } from "./common/guards/rate-limit.guard";
import { LoggingInterceptor } from "./common/interceptors/logging.interceptor";
import { TransformInterceptor } from "./common/interceptors/transform.interceptor";

/**
 * ---
 * THỨ TỰ CỦA GUARD TOÀN CỤC LÀ CÓ Ý NGHĨA
 *
 * NestJS chạy guard theo đúng thứ tự khai báo trong mảng `providers`:
 *
 *   1. ThrottlerGuard  — chặn dồn dập trước khi làm bất cứ việc gì tốn kém.
 *   2. RateLimitGuard  — ngưỡng riêng, chặt hơn, cho endpoint nhạy cảm.
 *   3. JwtAuthGuard    — "anh là ai".
 *   4. PermissionsGuard — "anh được làm gì". Phải chạy SAU cùng vì nó cần
 *                         `request.user` do JwtAuthGuard gắn vào.
 *
 * Đảo 3 và 4 thì PermissionsGuard luôn thấy `request.user` rỗng, và mọi
 * endpoint có yêu cầu quyền đều trả 403 — kể cả với người có đủ quyền.
 *
 * ---
 * VÌ SAO CÓ HAI LỚP RATE LIMIT
 *
 * `ThrottlerGuard` đếm trong RAM của tiến trình: đủ để chặn một script quét
 * toàn bộ API, nhưng chạy 2 replica là ngưỡng nhân đôi, và mỗi lần deploy là bộ
 * đếm về 0. Với `/auth/login` — endpoint mà người ta thật sự dò — điều đó không
 * chấp nhận được, nên `RateLimitGuard` dùng store Redis dùng chung của
 * `@repo/core`.
 */
@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: env.THROTTLE_TTL_SECONDS * 1000, limit: env.THROTTLE_LIMIT }]),
    AuthModule,
    UsersModule,
    RolesModule,
    NotificationsModule,
    DevicesModule,
    AuditModule,
    FilesModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },

    // Interceptor chạy theo thứ tự khai báo ở chiều VÀO và ngược lại ở chiều
    // RA. Logging đứng trước để nó bao trọn thời gian xử lý, kể cả phần
    // Transform bọc response.
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },

    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
