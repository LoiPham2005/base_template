import { Module } from "@nestjs/common";
import { APP_PIPE } from "@nestjs/core";
import { ZodValidationPipe } from "nestjs-zod";
import { UserModule } from "./user/user.module";

@Module({
  imports: [UserModule],
  providers: [
    // Validates every DTO (built from @repo/contracts Zod schemas) at
    // the controller boundary, before anything reaches a service.
    { provide: APP_PIPE, useClass: ZodValidationPipe },
  ],
})
export class AppModule {}
