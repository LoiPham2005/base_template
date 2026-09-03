import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { registerDeviceSchema } from "@repo/contracts";
import { DeviceService } from "@repo/core";
import { CurrentUser } from "../common/decorators/current-user.decorator";

export class RegisterDeviceDto extends createZodDto(registerDeviceSchema) {}

@ApiTags("devices")
@ApiBearerAuth()
@Controller("devices")
export class DevicesController {
  constructor(private readonly devices: DeviceService) {}

  /**
   * Đăng ký thiết bị nhận push. Client gọi ở mỗi lần mở app.
   *
   * Là `upsert` theo `(userId, fcmToken)`, nên gọi lại nhiều lần không sinh
   * bản ghi thừa — chỉ cập nhật `lastSeenAt`.
   */
  @Post()
  @ApiOperation({ summary: "Đăng ký / cập nhật thiết bị nhận push" })
  async register(@CurrentUser("sub") userId: string, @Body() dto: RegisterDeviceDto) {
    return this.devices.register(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: "Thiết bị đang hoạt động của tôi" })
  async list(@CurrentUser("sub") userId: string) {
    return this.devices.listActive(userId);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Ngừng nhận push trên một thiết bị (gọi khi đăng xuất)" })
  async deactivate(
    @CurrentUser("sub") userId: string,
    @Body() dto: RegisterDeviceDto,
  ): Promise<void> {
    await this.devices.deactivate(userId, dto.fcmToken);
  }
}
