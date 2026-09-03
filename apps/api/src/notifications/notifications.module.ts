import { Module } from "@nestjs/common";
import { NotificationService, core } from "@repo/core";
import { NotificationsController } from "./notifications.controller";

@Module({
  controllers: [NotificationsController],
  providers: [{ provide: NotificationService, useValue: core.notification }],
})
export class NotificationsModule {}
