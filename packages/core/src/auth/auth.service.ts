import type { PrismaClient } from "@repo/db";
import type { LoginInput, RegisterInput } from "@repo/contracts";
import { CryptoUtils } from "../common/crypto";
import { UserService } from "../user/user.service";

export class AuthService {
  private readonly users: UserService;

  constructor(private readonly db: PrismaClient) {
    this.users = new UserService(db);
  }

  /**
   * Đăng ký công khai. Role LUÔN là USER và không đọc từ input — nếu đọc,
   * bất kỳ ai gọi POST /auth/register cũng tự phong mình làm ADMIN.
   */
  async register(input: RegisterInput) {
    return this.users.create({
      email: input.email,
      password: input.password,
      name: input.name,
      role: "USER",
    });
  }

  /**
   * Ba nhánh thất bại — email không tồn tại, tài khoản chưa đặt mật khẩu, sai
   * mật khẩu — đều ném cùng một lỗi VÀ tốn thời gian như nhau. Nếu không, chỉ
   * cần đo thời gian phản hồi là dò được email nào đã đăng ký.
   */
  async validateUser(input: LoginInput) {
    const user = await this.db.user.findUnique({ where: { email: input.email } });

    if (!user?.password) {
      await CryptoUtils.fakeCompare(input.password);
      throw new InvalidCredentialsError();
    }

    const isValid = await CryptoUtils.comparePassword(input.password, user.password);
    if (!isValid) {
      throw new InvalidCredentialsError();
    }

    const { password: _password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async getProfile(userId: string) {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UserNotFoundError(userId);
    }
    return user;
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Email hoặc mật khẩu không chính xác");
    this.name = "InvalidCredentialsError";
  }
}

export class UserNotFoundError extends Error {
  constructor(id: string) {
    super(`Không tìm thấy người dùng có id "${id}"`);
    this.name = "UserNotFoundError";
  }
}
