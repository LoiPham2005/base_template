"use server";

import { redirect } from "next/navigation";
import type { Route } from "next";
import { apiFetch, ApiError } from "@/lib/api";
import { clearSession } from "@/lib/session";

/**
 * Hoàn tất đổi email.
 *
 * API thu hồi mọi phiên sau khi đổi, nên cookie hiện tại đã chết — xoá luôn ở
 * phía web thay vì để người dùng gặp một loạt lỗi 401 rồi tự đoán chuyện gì
 * đang xảy ra.
 */
export async function confirmEmailChangeAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");

  let status: "ok" | "invalid" | "conflict" | "error" = "ok";

  try {
    await apiFetch("/auth/change-email/confirm", {
      method: "POST",
      body: JSON.stringify({ token }),
      token: null,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      // 409 = ai đó đã đăng ký địa chỉ đó trong lúc chờ. Khác hẳn "link hỏng",
      // nên phải nói khác đi.
      status = error.status === 409 ? "conflict" : "invalid";
    } else {
      status = "error";
    }
  }

  await clearSession();

  redirect(`/login?emailChange=${status}` as Route);
}
