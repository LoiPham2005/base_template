import { Prisma, type PrismaClient } from "@repo/db";
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

/** Không bao giờ để cột `password` rời khỏi service. */
const PUBLIC_USER_FIELDS = {
  id: true,
  email: true,
  name: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type PublicUser = Prisma.UserGetPayload<{ select: typeof PUBLIC_USER_FIELDS }>;

/** Trần cứng cho `take`, để một query độc hại không kéo cả bảng về. */
const MAX_PAGE_SIZE = 100;

export class UserService {
  constructor(private readonly db: PrismaClient) {}

  async create(input: CreateUserInput): Promise<PublicUser> {
    // null chứ không phải "": chuỗi rỗng là một mật khẩu "hợp lệ" nhìn từ tầng
    // dữ liệu, còn null diễn đạt đúng "tài khoản chưa đặt mật khẩu".
    const password = input.password ? await CryptoUtils.hashPassword(input.password) : null;

    try {
      return await this.db.user.create({
        data: {
          email: input.email,
          password,
          name: input.name,
          role: input.role ?? "USER",
        },
        select: PUBLIC_USER_FIELDS,
      });
    } catch (error) {
      // Dựa vào unique constraint thay vì "kiểm tra rồi mới ghi": hai request
      // đồng thời cùng một email đều vượt qua được bước kiểm tra, chỉ database
      // mới phân xử được.
      if (isPrismaError(error, "P2002")) {
        throw new UserAlreadyExistsError(input.email);
      }
      throw error;
    }
  }

  async list(options: { skip?: number; take?: number } = {}): Promise<PublicUser[]> {
    return this.db.user.findMany({
      select: PUBLIC_USER_FIELDS,
      orderBy: { createdAt: "desc" },
      skip: options.skip ?? 0,
      take: Math.min(options.take ?? 50, MAX_PAGE_SIZE),
    });
  }

  async count(): Promise<number> {
    return this.db.user.count();
  }

  async findById(id: string): Promise<PublicUser | null> {
    return this.db.user.findUnique({ where: { id }, select: PUBLIC_USER_FIELDS });
  }
}

function isPrismaError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

export class UserAlreadyExistsError extends Error {
  constructor(email: string) {
    super(`Email "${email}" đã được sử dụng`);
    this.name = "UserAlreadyExistsError";
  }
}
