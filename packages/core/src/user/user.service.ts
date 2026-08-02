import type { PrismaClient } from "@repo/db";
import type { CreateUserInput } from "@repo/contracts";

/**
 * Plain class, no framework decorators. Instantiated with `new` in
 * Next.js (apps/web/lib/container.ts) and registered as a Nest provider
 * in apps/api — same logic, two entry points.
 *
 * Input is assumed already validated by the caller (react-hook-form +
 * zodResolver on the web, nestjs-zod DTO on the API) against the same
 * @repo/contracts schema, so this layer does not re-validate.
 */
import { CryptoUtils } from "../common/crypto";

export class UserService {
  constructor(private readonly db: PrismaClient) {}

  async create(input: CreateUserInput) {
    const existing = await this.db.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new UserAlreadyExistsError(input.email);
    }

    const hashedPassword = input.password ? await CryptoUtils.hashPassword(input.password) : "";

    return this.db.user.create({
      data: {
        email: input.email,
        password: hashedPassword,
        name: input.name,
        role: input.role ?? "USER",
      },
    });
  }

  async list() {
    return this.db.user.findMany({
      select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async findById(id: string) {
    return this.db.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true },
    });
  }
}

export class UserAlreadyExistsError extends Error {
  constructor(email: string) {
    super(`User with email "${email}" already exists`);
    this.name = "UserAlreadyExistsError";
  }
}
