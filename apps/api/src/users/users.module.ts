import { Module } from "@nestjs/common";
import { UsersController } from "./users.controller";

/**
 * Không khai `providers`: `UserService`, `PermissionService` và `AuditService`
 * đã được `AuthModule` (đánh dấu `@Global()`) cung cấp cho toàn ứng dụng.
 */
@Module({ controllers: [UsersController] })
export class UsersModule {}
