"use server";

import { resetPasswordSchema } from "@repo/contracts";
import { apiFetch, ApiError } from "@/lib/api";
import { clearSession } from "@/lib/session";

export type ResetPasswordState = {
  error?: string;
  fieldErrors?: Partial<Record<"password" | "token", string[]>>;
  done?: boolean;
};

export async function resetPasswordAction(
  _prev: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  if (formData.get("password") !== formData.get("passwordConfirm")) {
    return { fieldErrors: { password: ["Hai mật khẩu không khớp"] } };
  }

  try {
    await apiFetch("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify(parsed.data),
      token: null,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.fields) return { fieldErrors: error.fields as ResetPasswordState["fieldErrors"] };
      // 400/422 = link hỏng, đã dùng, hoặc hết hạn. API cố ý không phân biệt ba
      // trường hợp đó — nói rõ "link này đã được dùng" là xác nhận nó từng hợp lệ.
      if (error.status === 429) {
        return { error: "Bạn đã thử quá nhiều lần. Vui lòng đợi ít phút." };
      }
      return { error: error.message };
    }
    return { error: "Không đặt lại được mật khẩu lúc này. Vui lòng thử lại." };
  }

  /*
   * API đã thu hồi MỌI phiên của tài khoản này. Xoá luôn cookie ở phía web —
   * nếu trình duyệt đang giữ một phiên cũ, để nguyên là người dùng gặp một loạt
   * 401 rồi tự đoán chuyện gì đang xảy ra.
   */
  await clearSession();

  return { done: true };
}
