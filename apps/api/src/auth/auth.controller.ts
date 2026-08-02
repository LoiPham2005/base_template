import { Controller, Post, Body, Get, UseGuards, HttpCode, HttpStatus } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { AuthService } from "@repo/core";
import { JwtService } from "@nestjs/jwt";
import { LoginDto, RegisterDto } from "./auth.dto";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { CurrentUser, CurrentUserPayload } from "./current-user.decorator";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
  ) {}

  @Post("register")
  @ApiOperation({ summary: "Đăng ký tài khoản mới" })
  async register(@Body() dto: RegisterDto) {
    const user = await this.authService.register(dto);
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    return {
      success: true,
      data: { accessToken, user },
    };
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Đăng nhập hệ thống" })
  async login(@Body() dto: LoginDto) {
    const user = await this.authService.validateUser(dto);
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    return {
      success: true,
      data: { accessToken, user },
    };
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Lấy thông tin tài khoản hiện tại" })
  async getProfile(@CurrentUser() currentUser: CurrentUserPayload) {
    const user = await this.authService.getProfile(currentUser.sub);
    return {
      success: true,
      data: user,
    };
  }
}
