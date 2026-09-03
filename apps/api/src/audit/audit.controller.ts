import { Controller, Get, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { listAuditLogsSchema } from "@repo/contracts";
import { AuditService } from "@repo/core";
import { RequirePermissions } from "../common/decorators/permissions.decorator";

export class ListAuditLogsDto extends createZodDto(listAuditLogsSchema) {}

@ApiTags("audit")
@ApiBearerAuth()
@Controller("audit-logs")
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  /**
   * Chỉ ĐỌC — cố ý không có endpoint xoá.
   *
   * Nhật ký kiểm toán mà người dùng của hệ thống xoá được thì không còn là nhật
   * ký kiểm toán. Việc dọn dữ liệu cũ do job nền làm theo chính sách lưu trữ
   * (`AuditService.purgeOlderThan`), không do một request HTTP.
   */
  @Get()
  @RequirePermissions("audit:read")
  @ApiOperation({ summary: "Nhật ký hành động nhạy cảm (phân trang, lọc)" })
  async list(@Query() query: ListAuditLogsDto) {
    return this.audit.list(query);
  }
}
