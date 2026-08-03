"use server";

import { revalidatePath } from "next/cache";
import { createUserSchema } from "@repo/contracts";
import { apiFetch, ApiError } from "@/lib/api";

export type CreateUserState = {
  error?: string;
  fieldErrors?: Partial<Record<"email" | "name" | "password" | "role", string[]>>;
};

export async function createUserAction(
  _prevState: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  // `role` cố ý KHÔNG đọc từ form. Server Action là endpoint công khai — nếu
  // đọc, bất kỳ ai gửi được form cũng tự phong mình làm ADMIN chỉ bằng một
  // field ẩn. apps/api còn chặn thêm một lớp nữa (chỉ ADMIN gọi được), nhưng
  // không lớp nào được phép tin lớp kia.
  const parsed = createUserSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name") || undefined,
    password: formData.get("password") || undefined,
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    // Same POST /users the mobile app calls — apps/api is the single
    // place that enforces "email must be unique", not duplicated here.
    await apiFetch("/users", {
      method: "POST",
      body: JSON.stringify(parsed.data),
    });
  } catch (err) {
    if (err instanceof ApiError && (err.status === 409 || err.status === 403)) {
      return { error: err.message };
    }
    if (err instanceof ApiError && err.status === 401) {
      return { error: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." };
    }
    throw err;
  }

  revalidatePath("/users");
  return {};
}
