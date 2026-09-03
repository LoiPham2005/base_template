"use server";

import type { AuthResponse } from "@repo/contracts";
import { apiFetch, ApiError } from "@/lib/api";
import { setSession } from "@/lib/session";

/**
 * Hai Server Action cho luồng đăng nhập bằng passkey.
 *
 * Phải tách làm hai vì bước ở giữa — `navigator.credentials.get()` — chỉ chạy
 * được TRONG TRÌNH DUYỆT: nó cần quyền truy cập secure enclave của thiết bị.
 * Server không thay thế bước đó được, và đó chính là điều làm passkey chống
 * phishing.
 *
 * Vé (`challengeToken`) đi qua trình duyệt giữa hai bước. Nó là JWT do máy chủ
 * ký nên client không sửa được, và mang `typ: "webauthn_auth"` nên không dùng
 * làm access token được.
 */

export type PasskeyOptions = {
  options: Record<string, unknown>;
  challengeToken: string;
};

export async function getPasskeyLoginOptions(): Promise<PasskeyOptions> {
  return apiFetch<PasskeyOptions>("/auth/passkeys/login/options", {
    method: "POST",
    token: null,
  });
}

export type PasskeyLoginResult = { ok: true; next: string } | { ok: false; error: string };

/**
 * Đổi phản hồi từ authenticator lấy phiên đăng nhập.
 *
 * KHÔNG `redirect()` ở đây: hàm này được gọi từ một Client Component, và
 * `redirect()` hoạt động bằng cách ném exception — nó sẽ nổ giữa một khối
 * `try/catch` của client thay vì chuyển trang. Trả về đường dẫn để client tự
 * điều hướng.
 */
export async function verifyPasskeyLogin(
  challengeToken: string,
  response: unknown,
  next?: string,
): Promise<PasskeyLoginResult> {
  let auth: AuthResponse;

  try {
    auth = await apiFetch<AuthResponse>("/auth/passkeys/login/verify", {
      method: "POST",
      body: JSON.stringify({ challengeToken, response }),
      token: null,
    });
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, error: error.message };
    return { ok: false, error: "Không đăng nhập được lúc này. Vui lòng thử lại." };
  }

  await setSession(auth.tokens);

  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/users";
  return { ok: true, next: target };
}
