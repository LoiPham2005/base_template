import "server-only";
import { cookies } from "next/headers";
import type { TokenPair } from "@repo/contracts";

/**
 * Phiên đăng nhập phía web.
 *
 * Web và mobile dùng CHUNG một REST API, chỉ khác cách mang danh tính: app
 * mobile giữ token trong bộ nhớ an toàn của thiết bị, còn web giữ trong cookie
 * `httpOnly`. `httpOnly` là điểm mấu chốt — JavaScript trong trình duyệt không
 * đọc được, nên một lỗ XSS cũng không lấy được token.
 *
 * ---
 * VÌ SAO CÓ HAI COOKIE
 *
 * Access token sống rất ngắn (mặc định 15 phút) vì JWT đã ký thì không thu hồi
 * được. Refresh token sống 30 ngày nhưng nằm trong database nên thu hồi được
 * ngay. Hai vòng đời khác nhau thì phải là hai cookie khác nhau, với `maxAge`
 * khác nhau.
 *
 * Việc gia hạn do `middleware.ts` lo — xem ghi chú ở đó.
 */

export const ACCESS_TOKEN_COOKIE = "access_token";
export const REFRESH_TOKEN_COOKIE = "refresh_token";

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
} as const;

export async function getAccessToken(): Promise<string | undefined> {
  return (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
}

export async function getRefreshToken(): Promise<string | undefined> {
  return (await cookies()).get(REFRESH_TOKEN_COOKIE)?.value;
}

/**
 * ⚠️ Chỉ gọi được trong Server Action hoặc Route Handler.
 *
 * Next.js cấm ghi cookie trong lúc render Server Component — đó là lý do việc
 * tự động gia hạn token phải nằm ở `middleware.ts` chứ không nằm trong
 * `apiFetch`.
 */
export async function setSession(tokens: TokenPair): Promise<void> {
  const store = await cookies();

  store.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    ...cookieOptions,
    maxAge: tokens.expiresIn,
  });

  store.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    ...cookieOptions,
    // Lấy hạn thật do API trả về thay vì viết cứng 30 ngày: đổi
    // `REFRESH_TOKEN_TTL_DAYS` ở API mà web vẫn giữ số cũ thì cookie hết hạn
    // trước token (người dùng bị đăng xuất sớm) hoặc ngược lại (cookie còn
    // nhưng token đã chết, và mọi request đều 401).
    maxAge: Math.max(
      0,
      Math.floor((new Date(tokens.refreshExpiresAt).getTime() - Date.now()) / 1000),
    ),
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.set(ACCESS_TOKEN_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  store.set(REFRESH_TOKEN_COOKIE, "", { ...cookieOptions, maxAge: 0 });
}
