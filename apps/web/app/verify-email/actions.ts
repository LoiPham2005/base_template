"use server";

import { apiFetch, ApiError } from "@/lib/api";

export type VerifyEmailState = { status?: "ok" | "invalid" | "error" };

/**
 * Xác thực email.
 *
 * Được gọi khi người dùng BẤM NÚT, không phải khi mở trang — xem ghi chú trong
 * `page.tsx`.
 */
export async function verifyEmailAction(
  _prev: VerifyEmailState,
  formData: FormData,
): Promise<VerifyEmailState> {
  const token = String(formData.get("token") ?? "");
  if (!token) return { status: "invalid" };

  try {
    await apiFetch("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
      token: null,
    });
  } catch (error) {
    // API gộp mọi lý do thất bại (không tồn tại / đã dùng / hết hạn) vào một
    // lỗi — phân biệt chúng là xác nhận cho người hỏi biết token đó từng hợp lệ.
    return { status: error instanceof ApiError ? "invalid" : "error" };
  }

  return { status: "ok" };
}
