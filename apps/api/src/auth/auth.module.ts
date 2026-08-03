import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { core, AuthService } from "@repo/core";
import { AuthController } from "./auth.controller";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { RolesGuard } from "./roles.guard";
import { env } from "../env";

@Module({
  imports: [
    JwtModule.register({
      secret: env.JWT_SECRET,
      // JWT_EXPIRES_IN là chuỗi tự do ("7d", "15m"); kiểu của @nestjs/jwt là
      // union hẹp nên phải khẳng định kiểu. Dùng ép kiểu có tên thay vì `any`
      // để không vô tình tắt kiểm tra cho cả object.
      signOptions: { expiresIn: env.JWT_EXPIRES_IN as `${number}${"s" | "m" | "h" | "d"}` },
    }),
  ],
  controllers: [AuthController],
  providers: [{ provide: AuthService, useValue: core.auth }, JwtAuthGuard, RolesGuard],
  exports: [JwtAuthGuard, RolesGuard, JwtModule],
})
export class AuthModule {}
