"use server";

import { forgotPasswordSchema } from "@repo/contracts";
import { apiFetch, ApiError } from "@/lib/api";

export type ForgotPasswordState = {
  error?: string;
  fieldErrors?: Partial<Record<"email", string[]>>;
  done?: boolean;
};

/**
 * ⚠️ LUÔN hiện màn "đã gửi", kể cả khi email không tồn tại.
 *
 * API đã cố tình trả 204 cho mọi trường hợp; nếu giao diện lại phân biệt
 * ("email này chưa đăng ký") thì công sức đó thành vô nghĩa — trang web trở
 * thành công cụ dò danh sách người dùng.
 *
 * Ngoại lệ duy nhất là 429: người dùng cần biết họ bị chặn tạm thời, và thông
 * tin đó không tiết lộ gì về việc email có tồn tại hay không.
 */
export async function forgotPasswordAction(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    await apiFetch("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify(parsed.data),
      token: null,
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) {
      return { error: "Bạn đã yêu cầu quá nhiều lần. Vui lòng đợi ít phút." };
    }
    // Mọi lỗi khác vẫn hiện "đã gửi" — xem ghi chú trên.
  }

  return { done: true };
}
