"use server";

import { registerSchema, type AuthResponse } from "@repo/contracts";
import { apiFetch, ApiError } from "@/lib/api";
import { setSession } from "@/lib/session";

export type RegisterState = {
  error?: string;
  fieldErrors?: Partial<Record<"email" | "password" | "username" | "fullName", string[]>>;
  /** Đăng ký xong: hiện màn "kiểm tra hộp thư", không chuyển trang ngay. */
  done?: boolean;
};

export async function registerAction(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    fullName: formData.get("fullName") || undefined,
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  let response: AuthResponse;
  try {
    response = await apiFetch<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(parsed.data),
      token: null,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      // 422 kèm `fields` — API đã nói rõ trường nào sai.
      if (error.fields) return { fieldErrors: error.fields as RegisterState["fieldErrors"] };
      if (error.status === 409) return { error: error.message };
      if (error.status === 429) {
        return { error: "Bạn đã thử quá nhiều lần. Vui lòng đợi một lát." };
      }
    }
    return { error: "Không đăng ký được lúc này. Vui lòng thử lại." };
  }

  /*
   * API đã cấp token luôn, nên đăng nhập ngay được. Nhưng KHÔNG chuyển thẳng
   * vào trong: người dùng cần nhìn thấy dòng "hãy mở hộp thư để xác thực", nếu
   * không họ sẽ bỏ qua email đó và mắc kẹt ở bước sau.
   */
  await setSession(response.tokens);

  return { done: true };
}
