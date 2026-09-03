import { Module } from "@nestjs/common";
import { DeviceService, core } from "@repo/core";
import { DevicesController } from "./devices.controller";

@Module({
  controllers: [DevicesController],
  providers: [{ provide: DeviceService, useValue: core.device }],
})
export class DevicesModule {}
