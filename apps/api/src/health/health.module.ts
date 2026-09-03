import { Module } from "@nestjs/common";
import { HealthService, core } from "@repo/core";
import { HealthController } from "./health.controller";

@Module({
  controllers: [HealthController],
  providers: [{ provide: HealthService, useValue: core.health }],
})
export class HealthModule {}
