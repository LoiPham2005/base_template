import { Module } from "@nestjs/common";
import { UserService, core } from "@repo/core";
import { UserController } from "./user.controller";

@Module({
  controllers: [UserController],
  providers: [
    // Reuses the same UserService instance the web app calls in-process —
    // apps/api never imports @repo/db, it only exposes core over HTTP.
    { provide: UserService, useValue: core.user },
  ],
})
export class UserModule {}
