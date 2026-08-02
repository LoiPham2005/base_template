import type { PrismaClient } from "@repo/db";
import type { LoginInput, RegisterInput } from "@repo/contracts";
import { CryptoUtils } from "../common/crypto";
import { UserAlreadyExistsError } from "../user/user.service";

export class AuthService {
  constructor(private readonly db: PrismaClient) {}

  async register(input: RegisterInput) {
    const existing = await this.db.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new UserAlreadyExistsError(input.email);
    }

    const hashedPassword = await CryptoUtils.hashPassword(input.password);

    const user = await this.db.user.create({
      data: {
        email: input.email,
        password: hashedPassword,
        name: input.name,
        role: "USER",
      },
    });

    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async validateUser(input: LoginInput) {
    const user = await this.db.user.findUnique({ where: { email: input.email } });
    if (!user || !user.password) {
      throw new InvalidCredentialsError();
    }

    const isValid = await CryptoUtils.comparePassword(input.password, user.password);
    if (!isValid) {
      throw new InvalidCredentialsError();
    }

    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async getProfile(userId: string) {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UserNotFoundError(userId);
    }

    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
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
    super(`User with ID "${id}" not found`);
    this.name = "UserNotFoundError";
  }
}
