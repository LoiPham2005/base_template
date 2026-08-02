import { Module } from "@nestjs/common";
import { APP_PIPE, APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ZodValidationPipe } from "nestjs-zod";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { UserModule } from "./user/user.module";
import { AuthModule } from "./auth/auth.module";
import { HealthModule } from "./health/health.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    UserModule,
    AuthModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
