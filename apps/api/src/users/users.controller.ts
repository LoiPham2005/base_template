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
  Put,
  Query,
  Req,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { FastifyRequest } from "fastify";
import { AUDIT_ACTIONS, type Paginated, type PublicUser } from "@repo/contracts";
import { AuditService, PermissionService, UserNotFoundError, UserService } from "@repo/core";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser, type CurrentUserPayload } from "../common/decorators/current-user.decorator";
import { clientIp, userAgent } from "../common/request";
import {
  AssignRolesDto,
  CreateUserDto,
  ListUsersDto,
  SetUserPermissionDto,
  SetUserStatusDto,
  UpdateUserDto,
} from "./users.dto";

/**
 * Quản trị người dùng.
 *
 * Mọi thao tác GHI ở đây đều ghi nhật ký kiểm toán và xoá cache quyền của người
 * bị tác động. Quên bước thứ hai thì thay đổi vai trò chỉ có hiệu lực sau khi
 * cache hết hạn (60 giây) — người quản trị thử lại ngay, thấy chưa đổi, và kết
 * luận là hệ thống hỏng.
 */
@ApiTags("users")
@ApiBearerAuth()
@Controller("users")
export class UsersController {
  constructor(
    private readonly users: UserService,
    private readonly permissions: PermissionService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions("user:read")
  @ApiOperation({ summary: "Danh sách người dùng (phân trang, tìm kiếm, lọc)" })
  async list(@Query() query: ListUsersDto): Promise<Paginated<PublicUser>> {
    return this.users.list(query);
  }

  @Get(":id")
  @RequirePermissions("user:read")
  @ApiOperation({ summary: "Chi tiết một người dùng" })
  async detail(@Param("id") id: string) {
    return this.users.getProfile(id);
  }

  /** Quyền hiệu lực của một người — hợp của vai trò, đã áp ngoại lệ cá nhân. */
  @Get(":id/permissions")
  @RequirePermissions("user:read")
  @ApiOperation({ summary: "Quyền hiệu lực của một người dùng" })
  async permissionsOf(@Param("id") id: string) {
    const user = await this.users.findById(id);
    if (!user) throw new UserNotFoundError(id);

    return { permissions: [...(await this.permissions.permissionsFor(id))] };
  }

  @Post()
  @RequirePermissions("user:create")
  @ApiOperation({ summary: "Tạo người dùng" })
  async create(
    @Body() dto: CreateUserDto,
    @CurrentUser() actor: CurrentUserPayload,
    @Req() request: FastifyRequest,
  ): Promise<PublicUser> {
    const user = await this.users.create({ ...dto, actorId: actor.sub });

    await this.audit.record({
      action: AUDIT_ACTIONS.USER_CREATED,
      entity: "User",
      entityId: user.id,
      actorId: actor.sub,
      actorEmail: actor.email,
      metadata: { email: user.email, roles: user.roles },
      ip: clientIp(request),
      userAgent: userAgent(request),
    });

    return user;
  }

  @Patch(":id")
  @RequirePermissions("user:update")
  @ApiOperation({ summary: "Cập nhật người dùng" })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: CurrentUserPayload,
    @Req() request: FastifyRequest,
  ): Promise<PublicUser> {
    const user = await this.users.update(id, dto, { actorId: actor.sub });

    // Vai trò có thể vừa đổi — cache quyền của người này không còn đúng nữa.
    await this.permissions.invalidateUser(id);

    await this.audit.record({
      action: dto.roleKeys ? AUDIT_ACTIONS.USER_ROLES_ASSIGNED : AUDIT_ACTIONS.USER_UPDATED,
      entity: "User",
      entityId: id,
      actorId: actor.sub,
      actorEmail: actor.email,
      metadata: { changes: dto },
      ip: clientIp(request),
      userAgent: userAgent(request),
    });

    return user;
  }

  @Put(":id/roles")
  @RequirePermissions("user:update")
  @ApiOperation({ summary: "Gán lại toàn bộ vai trò cho người dùng" })
  async assignRoles(
    @Param("id") id: string,
    @Body() dto: AssignRolesDto,
    @CurrentUser() actor: CurrentUserPayload,
    @Req() request: FastifyRequest,
  ): Promise<PublicUser> {
    const user = await this.users.update(id, { roleKeys: dto.roleKeys }, { actorId: actor.sub });
    await this.permissions.invalidateUser(id);

    await this.audit.record({
      action: AUDIT_ACTIONS.USER_ROLES_ASSIGNED,
      entity: "User",
      entityId: id,
      actorId: actor.sub,
      actorEmail: actor.email,
      metadata: { roleKeys: dto.roleKeys },
      ip: clientIp(request),
      userAgent: userAgent(request),
    });

    return user;
  }

  @Put(":id/status")
  @RequirePermissions("user:update")
  @ApiOperation({ summary: "Đổi trạng thái (khoá/mở khoá tài khoản)" })
  async setStatus(
    @Param("id") id: string,
    @Body() dto: SetUserStatusDto,
    @CurrentUser() actor: CurrentUserPayload,
    @Req() request: FastifyRequest,
  ): Promise<PublicUser> {
    const user = await this.users.setStatus(id, dto.status, { actorId: actor.sub });

    await this.audit.record({
      action: AUDIT_ACTIONS.USER_STATUS_CHANGED,
      entity: "User",
      entityId: id,
      actorId: actor.sub,
      actorEmail: actor.email,
      metadata: { status: dto.status },
      ip: clientIp(request),
      userAgent: userAgent(request),
    });

    return user;
  }

  /**
   * Cấp thêm hoặc TƯỚC một quyền cụ thể của riêng người này.
   *
   * Ngoại lệ cá nhân, đè lên quyền đến từ vai trò. `isGranted = false` thắng
   * mọi vai trò — dùng khi cần chặn gấp một người khỏi một hành động mà không
   * muốn dựng cả một vai trò mới.
   */
  @Put(":id/permissions")
  @RequirePermissions("user:update")
  @ApiOperation({ summary: "Cấp/tước một quyền riêng cho người dùng" })
  async setPermission(
    @Param("id") id: string,
    @Body() dto: SetUserPermissionDto,
    @CurrentUser() actor: CurrentUserPayload,
    @Req() request: FastifyRequest,
  ) {
    await this.users.setUserPermission(id, dto.permissionKey, dto.isGranted, {
      actorId: actor.sub,
      expiresAt: dto.expiresAt ?? null,
    });
    await this.permissions.invalidateUser(id);

    await this.audit.record({
      action: AUDIT_ACTIONS.USER_PERMISSION_OVERRIDDEN,
      entity: "User",
      entityId: id,
      actorId: actor.sub,
      actorEmail: actor.email,
      metadata: {
        permissionKey: dto.permissionKey,
        isGranted: dto.isGranted,
        expiresAt: dto.expiresAt?.toISOString() ?? null,
      },
      ip: clientIp(request),
      userAgent: userAgent(request),
    });

    return { permissions: [...(await this.permissions.permissionsFor(id))] };
  }

  @Delete(":id/permissions/:permissionKey")
  @RequirePermissions("user:update")
  @ApiOperation({ summary: "Gỡ ngoại lệ, trả người dùng về đúng quyền của vai trò" })
  async clearPermission(@Param("id") id: string, @Param("permissionKey") permissionKey: string) {
    await this.users.clearUserPermission(id, permissionKey);
    await this.permissions.invalidateUser(id);
    return { permissions: [...(await this.permissions.permissionsFor(id))] };
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions("user:delete")
  @ApiOperation({ summary: "Xoá mềm người dùng (thu hồi mọi phiên)" })
  async remove(
    @Param("id") id: string,
    @CurrentUser() actor: CurrentUserPayload,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    await this.users.softDelete(id, { actorId: actor.sub });
    await this.permissions.invalidateUser(id);

    await this.audit.record({
      action: AUDIT_ACTIONS.USER_DELETED,
      entity: "User",
      entityId: id,
      actorId: actor.sub,
      actorEmail: actor.email,
      ip: clientIp(request),
      userAgent: userAgent(request),
    });
  }
}
