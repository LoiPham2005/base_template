"use server";

import { revalidatePath } from "next/cache";
import { createUserSchema } from "@repo/contracts";
import { apiFetch, ApiError } from "@/lib/api";

export type CreateUserState = {
  error?: string;
  fieldErrors?: Partial<Record<"email" | "fullName" | "password" | "roleKeys", string[]>>;
};

export async function createUserAction(
  _prevState: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  /*
   * `roleKeys` cố ý KHÔNG đọc từ form.
   *
   * Server Action là một endpoint công khai — nếu đọc, bất kỳ ai gửi được form
   * cũng tự phong mình làm SUPER_ADMIN chỉ bằng một field ẩn. `apps/api` còn
   * chặn thêm một lớp nữa (phải có quyền `user:create`), nhưng không lớp nào
   * được phép tin lớp kia.
   */
  const parsed = createUserSchema.safeParse({
    email: formData.get("email"),
    fullName: formData.get("fullName") || undefined,
    password: formData.get("password") || undefined,
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    // Cùng `POST /users` mà app mobile gọi — `apps/api` là nơi DUY NHẤT áp luật
    // "email phải là duy nhất", không chép lại ở đây.
    await apiFetch("/users", { method: "POST", body: JSON.stringify(parsed.data) });
  } catch (error) {
    if (error instanceof ApiError) {
      // 422 kèm `fields`: API đã nói rõ trường nào sai, hiển thị ngay dưới ô đó.
      if (error.fields) {
        return { fieldErrors: error.fields as CreateUserState["fieldErrors"] };
      }
      if ([401, 403, 409].includes(error.status)) return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/users");
  return {};
}
