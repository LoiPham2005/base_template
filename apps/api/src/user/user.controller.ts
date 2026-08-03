import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { UserAlreadyExistsError, UserService } from "@repo/core";
import { CurrentUser, type CurrentUserPayload } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { CreateUserDto } from "./user.dto";

/**
 * LỖ HỔNG ĐÃ VÁ: trước đây controller này KHÔNG có guard nào.
 *
 * Hệ quả cụ thể: `POST /users` nhận cả trường `role` (createUserSchema khai báo
 * `role: z.enum(["USER","ADMIN"]).optional()`), nên bất kỳ ai trên Internet gửi
 * `{"email":"...","password":"...","role":"ADMIN"}` là tự tạo được tài khoản
 * quản trị — không cần đăng nhập. `GET /users` thì để lộ email của toàn bộ
 * người dùng.
 *
 * Guard đặt ở cấp class để endpoint thêm sau này mặc định được bảo vệ; muốn mở
 * public thì phải cố ý gỡ ra, chứ không phải nhớ mà thêm vào.
 */
@ApiTags("users")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("users")
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @Roles("ADMIN")
  @ApiOperation({ summary: "Danh sách người dùng (chỉ ADMIN)" })
  list() {
    return this.userService.list();
  }

  @Get(":id")
  @ApiOperation({ summary: "Xem một người dùng (ADMIN, hoặc chính mình)" })
  async findOne(@Param("id") id: string, @CurrentUser() currentUser: CurrentUserPayload) {
    // Không dùng @Roles ở đây: người dùng thường vẫn được xem hồ sơ của chính
    // mình. Kiểm tra quyền vì thế phải làm thủ công.
    if (currentUser.role !== "ADMIN" && currentUser.sub !== id) {
      throw new ForbiddenException("Bạn không có quyền xem người dùng này");
    }

    const user = await this.userService.findById(id);
    if (!user) {
      throw new NotFoundException(`Không tìm thấy người dùng "${id}"`);
    }
    return user;
  }

  @Post()
  @Roles("ADMIN")
  @ApiOperation({ summary: "Tạo người dùng (chỉ ADMIN)" })
  async create(@Body() dto: CreateUserDto) {
    // `role` trong DTO giờ an toàn: chỉ ADMIN mới tới được đây. Người dùng
    // thường muốn tự đăng ký thì đi qua POST /auth/register, nơi role luôn
    // bị ép thành USER.
    try {
      return await this.userService.create(dto);
    } catch (err) {
      if (err instanceof UserAlreadyExistsError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }
  }
}
