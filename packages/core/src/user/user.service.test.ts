import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@repo/db";
import { UserAlreadyExistsError, UserService } from "./user.service";

function createMockDb(overrides: Partial<PrismaClient["user"]> = {}) {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }) => ({ id: "u1", ...data })),
      findMany: vi.fn().mockResolvedValue([]),
      ...overrides,
    },
  } as unknown as PrismaClient;
}

describe("UserService", () => {
  it("creates a user when the email is not taken", async () => {
    const db = createMockDb();
    const service = new UserService(db);

    const result = await service.create({ email: "a@example.com", name: "A" });

    expect(result).toMatchObject({ email: "a@example.com", name: "A" });
    expect(db.user.create).toHaveBeenCalledOnce();
  });

  it("rejects duplicate emails", async () => {
    const db = createMockDb({
      findUnique: vi.fn().mockResolvedValue({ id: "existing" }),
    });
    const service = new UserService(db);

    await expect(service.create({ email: "dup@example.com" })).rejects.toThrow(
      UserAlreadyExistsError,
    );
  });
});
