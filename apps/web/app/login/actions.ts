"use server";

import { redirect } from "next/navigation";
import type { Route } from "next";
import {
  loginSchema,
  verifyTwoFactorSchema,
  type AuthResponse,
  type TwoFactorChallenge,
} from "@repo/contracts";
import { apiFetch, ApiError } from "@/lib/api";
import { clearSession, getRefreshToken, setSession } from "@/lib/session";

export type LoginState = {
  error?: string;
  fieldErrors?: Partial<Record<"identifier" | "password", string[]>>;
  /**
   * Có giá trị khi tài khoản bật 2FA: mật khẩu đã đúng, còn thiếu mã.
   *
   * Form chuyển sang bước hai và giữ vé này trong một input ẩn. Vé mang
   * `typ: "2fa"` nên nó không dùng được ở bất cứ endpoint nào khác — kể cả khi
   * ai đó đọc được HTML.
   */
  challengeToken?: string;
};

/** Phản hồi của `/auth/login` là một trong hai hình dạng — xem AuthController. */
function isTwoFactorChallenge(value: unknown): value is TwoFactorChallenge {
  return typeof value === "object" && value !== null && "twoFactorRequired" in value;
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const next = String(formData.get("next") ?? "/users");

  let response: AuthResponse | TwoFactorChallenge;
  try {
    response = await apiFetch<AuthResponse | TwoFactorChallenge>("/auth/login", {
      method: "POST",
      body: JSON.stringify(parsed.data),
      // Không gửi token cũ: đang đăng nhập lại thì token cũ (nếu còn) chẳng
      // liên quan gì, và gửi kèm chỉ làm log phía API khó đọc.
      token: null,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      // Dùng nguyên thông điệp của API cho 401/403/423: nó cố tình giống nhau
      // ở mọi nhánh thất bại (không tiết lộ email nào đã đăng ký), và với tài
      // khoản bị khoá thì nó nói rõ còn bao nhiêu phút.
      if ([401, 403, 423].includes(error.status)) return { error: error.message };
      if (error.status === 429) return { error: "Bạn đã thử quá nhiều lần. Vui lòng đợi một lát." };
    }
    return { error: "Không thể đăng nhập lúc này. Vui lòng thử lại." };
  }

  // Tài khoản có 2FA: dừng ở đây, chuyển form sang bước nhập mã. CHƯA có
  // phiên nào được tạo.
  if (isTwoFactorChallenge(response)) {
    return { challengeToken: response.challengeToken };
  }

  await setSession(response.tokens);

  // `redirect()` hoạt động bằng cách ném exception — phải nằm NGOÀI try/catch.
  // Chỉ nhận đường dẫn nội bộ: `next` đến từ URL nên `//evil.com` sẽ thành một
  // lần chuyển hướng ra ngoài mà người dùng tưởng vẫn ở trong hệ thống.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/users";

  // `as Route` là cần thiết vì `typedRoutes` của Next chỉ chấp nhận đường dẫn
  // biết trước lúc biên dịch, còn giá trị này đến từ URL. Phép kiểm tra ngay
  // phía trên mới là thứ bảo đảm an toàn thật.
  redirect(safeNext as Route);
}

export async function logoutAction(): Promise<void> {
  const refreshToken = await getRefreshToken();

  // Thu hồi ở phía server TRƯỚC khi xoá cookie. Chỉ xoá cookie thì refresh
  // token vẫn sống trong database — ai copy được nó vẫn đăng nhập lại được,
  // suốt 30 ngày.
  if (refreshToken) {
    await apiFetch("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
      token: null,
    }).catch(() => {
      // API không phản hồi thì vẫn phải xoá cookie phía client — người dùng đã
      // bấm "đăng xuất" và họ phải thấy mình đã đăng xuất.
    });
  }

  await clearSession();
  redirect("/login");
}

/**
 * Bước hai của đăng nhập khi tài khoản bật 2FA.
 *
 * Nhận cả mã TOTP 6 số lẫn mã khôi phục 10 ký tự — người dùng ở màn hình này
 * chỉ có một ô nhập và không nên phải tự phân loại thứ mình đang dán vào.
 */
export async function verifyTwoFactorAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = verifyTwoFactorSchema.safeParse({
    challengeToken: formData.get("challengeToken"),
    code: formData.get("code"),
  });

  if (!parsed.success) {
    return {
      challengeToken: String(formData.get("challengeToken") ?? ""),
      error: "Mã xác thực không hợp lệ",
    };
  }

  const next = String(formData.get("next") ?? "/users");

  let response: AuthResponse;
  try {
    response = await apiFetch<AuthResponse>("/auth/2fa/verify", {
      method: "POST",
      body: JSON.stringify(parsed.data),
      token: null,
    });
  } catch (error) {
    // Giữ lại vé để người dùng thử tiếp — trừ khi chính vé đã hết hạn, lúc đó
    // họ phải đăng nhập lại từ đầu.
    if (error instanceof ApiError && error.status === 401) {
      return { challengeToken: parsed.data.challengeToken, error: error.message };
    }
    if (error instanceof ApiError && error.status === 429) {
      return { error: "Bạn đã thử quá nhiều lần. Vui lòng đợi một lát rồi đăng nhập lại." };
    }
    return { error: "Không xác thực được lúc này. Vui lòng thử lại." };
  }

  await setSession(response.tokens);

  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/users";
  redirect(safeNext as Route);
}
