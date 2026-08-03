import "server-only";
import { cookies } from "next/headers";

/**
 * Phiên đăng nhập phía web.
 *
 * Web và mobile dùng chung REST API, chỉ khác cách mang danh tính: app mobile
 * giữ access token trong bộ nhớ an toàn của thiết bị, còn web giữ trong cookie
 * httpOnly. Cookie httpOnly là điểm mấu chốt — JavaScript trong trình duyệt
 * không đọc được nó, nên một lỗ XSS không lấy được token.
 */

const SESSION_COOKIE = "access_token";

export async function getAccessToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value;
}

export async function setAccessToken(token: string, maxAgeSeconds: number): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

export async function clearAccessToken(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
