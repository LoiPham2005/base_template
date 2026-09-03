import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import type { FastifyRequest } from "fastify";
import {
  AUDIT_ACTIONS,
  createRoleSchema,
  permissionsByCategory,
  updateRoleSchema,
  type Role,
} from "@repo/contracts";
import { AuditService, RoleService } from "@repo/core";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser, type CurrentUserPayload } from "../common/decorators/current-user.decorator";
import { clientIp } from "../common/request";

export class CreateRoleDto extends createZodDto(createRoleSchema) {}
export class UpdateRoleDto extends createZodDto(updateRoleSchema) {}

@ApiTags("roles")
@ApiBearerAuth()
@Controller()
export class RolesController {
  constructor(
    private readonly roles: RoleService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Danh mục quyền, gom theo nhóm — dữ liệu để dựng màn phân quyền.
   *
   * Đọc từ CODE (`@repo/contracts`) chứ không từ database: code là nguồn sự
   * thật về những quyền TỒN TẠI, database chỉ giữ việc GÁN chúng cho vai trò.
   * Xem ghi chú đầu `permissions.ts`.
   */
  @Get("permissions")
  @RequirePermissions("role:read")
  @ApiOperation({ summary: "Danh mục quyền, gom theo nhóm" })
  listPermissions() {
    return { categories: permissionsByCategory() };
  }

  @Get("roles")
  @RequirePermissions("role:read")
  @ApiOperation({ summary: "Danh sách vai trò kèm quyền và số người dùng" })
  async list(): Promise<Role[]> {
    return this.roles.list();
  }

  @Get("roles/:key")
  @RequirePermissions("role:read")
  @ApiOperation({ summary: "Chi tiết một vai trò" })
  async detail(@Param("key") key: string): Promise<Role> {
    return this.roles.findByKey(key);
  }

  @Post("roles")
  @RequirePermissions("role:create")
  @ApiOperation({ summary: "Tạo vai trò mới" })
  async create(
    @Body() dto: CreateRoleDto,
    @CurrentUser() actor: CurrentUserPayload,
    @Req() request: FastifyRequest,
  ): Promise<Role> {
    const role = await this.roles.create(dto);

    await this.audit.record({
      action: AUDIT_ACTIONS.ROLE_CREATED,
      entity: "Role",
      entityId: role.id,
      actorId: actor.sub,
      actorEmail: actor.email,
      metadata: { key: role.key, permissions: role.permissions },
      ip: clientIp(request),
    });

    return role;
  }

  @Patch("roles/:key")
  @RequirePermissions("role:update")
  @ApiOperation({ summary: "Đổi tên vai trò và/hoặc gán lại toàn bộ quyền" })
  async update(
    @Param("key") key: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() actor: CurrentUserPayload,
    @Req() request: FastifyRequest,
  ): Promise<Role> {
    const role = await this.roles.update(key, dto);

    await this.audit.record({
      action: AUDIT_ACTIONS.ROLE_UPDATED,
      entity: "Role",
      entityId: role.id,
      actorId: actor.sub,
      actorEmail: actor.email,
      metadata: { key, changes: dto },
      ip: clientIp(request),
    });

    return role;
  }

  @Delete("roles/:key")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions("role:delete")
  @ApiOperation({
    summary: "Xoá vai trò (chỉ khi không phải vai trò hệ thống và không ai đang dùng)",
  })
  async remove(
    @Param("key") key: string,
    @CurrentUser() actor: CurrentUserPayload,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    await this.roles.remove(key);

    await this.audit.record({
      action: AUDIT_ACTIONS.ROLE_DELETED,
      entity: "Role",
      entityId: key,
      actorId: actor.sub,
      actorEmail: actor.email,
      ip: clientIp(request),
    });
  }
}
