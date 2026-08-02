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
      signOptions: { expiresIn: env.JWT_EXPIRES_IN as any },
    }),
  ],
  controllers: [AuthController],
  providers: [{ provide: AuthService, useValue: core.auth }, JwtAuthGuard, RolesGuard],
  exports: [JwtAuthGuard, RolesGuard, JwtModule],
})
export class AuthModule {}
