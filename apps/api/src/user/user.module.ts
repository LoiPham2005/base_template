import { Module } from "@nestjs/common";
import { UserService, core } from "@repo/core";
import { AuthModule } from "../auth/auth.module";
import { UserController } from "./user.controller";

@Module({
  // UserController dùng JwtAuthGuard/RolesGuard, mà JwtAuthGuard cần JwtService.
  // Không import AuthModule thì Nest không giải được dependency và app chết
  // ngay lúc khởi động.
  imports: [AuthModule],
  controllers: [UserController],
  providers: [
    // Reuses the same UserService instance the web app calls in-process —
    // apps/api never imports @repo/db, it only exposes core over HTTP.
    { provide: UserService, useValue: core.user },
  ],
})
export class UserModule {}
