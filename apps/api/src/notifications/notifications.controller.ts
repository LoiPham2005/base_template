import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { AUDIT_ACTIONS, listNotificationsSchema, sendNotificationSchema } from "@repo/contracts";
import { AuditService, NotificationService } from "@repo/core";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser, type CurrentUserPayload } from "../common/decorators/current-user.decorator";

export class SendNotificationDto extends createZodDto(sendNotificationSchema) {}
export class ListNotificationsDto extends createZodDto(listNotificationsSchema) {}

@ApiTags("notifications")
@ApiBearerAuth()
@Controller("notifications")
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Hộp thông báo của CHÍNH người đang đăng nhập.
   *
   * `userId` lấy từ token, KHÔNG nhận từ query — nếu nhận thì đổi một tham số
   * là đọc được hộp thư của người khác.
   */
  @Get()
  @RequirePermissions("notification:read")
  @ApiOperation({ summary: "Hộp thông báo của tôi" })
  async list(@CurrentUser("sub") userId: string, @Query() query: ListNotificationsDto) {
    return this.notifications.listForUser(userId, query);
  }

  /** Endpoint riêng cho cái chuông: chỉ một con số, đi thẳng vào index. */
  @Get("unread-count")
  @ApiOperation({ summary: "Số thông báo chưa đọc" })
  async unreadCount(@CurrentUser("sub") userId: string) {
    return { count: await this.notifications.unreadCount(userId) };
  }

  @Post(":id/read")
  @ApiOperation({ summary: "Đánh dấu một thông báo đã đọc" })
  async markRead(@CurrentUser("sub") userId: string, @Param("id") recipientId: string) {
    return { updated: await this.notifications.markRead(recipientId, userId) };
  }

  @Post("read-all")
  @ApiOperation({ summary: "Đánh dấu tất cả đã đọc" })
  async markAllRead(@CurrentUser("sub") userId: string) {
    return { updated: await this.notifications.markAllRead(userId) };
  }

  @Post()
  @RequirePermissions("notification:send")
  @ApiOperation({ summary: "Gửi thông báo (DIRECT / TOPIC / BROADCAST)" })
  async send(@Body() dto: SendNotificationDto, @CurrentUser() actor: CurrentUserPayload) {
    const result = await this.notifications.send(dto, actor.sub);

    await this.audit.record({
      action: AUDIT_ACTIONS.NOTIFICATION_SENT,
      entity: "Notification",
      entityId: result.id,
      actorId: actor.sub,
      actorEmail: actor.email,
      metadata: { type: dto.type, title: dto.title, recipientCount: result.recipientCount },
    });

    return result;
  }
}
