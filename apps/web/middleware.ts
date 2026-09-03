import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/session";

/**
 * Tự động gia hạn phiên khi access token hết hạn.
 *
 * ---
 * VÌ SAO PHẢI Ở MIDDLEWARE
 *
 * Access token chỉ sống 15 phút. Không có lớp này thì cứ 15 phút một lần người
 * dùng bị đá về trang đăng nhập dù refresh token còn hiệu lực cả tháng.
 *
 * Và nó BUỘC phải nằm ở đây chứ không nằm trong `apiFetch`: Next.js cấm ghi
 * cookie trong lúc render Server Component, nên `apiFetch` có lấy được token
 * mới cũng không lưu lại được — lần sau lại phải làm lại từ đầu.
 *
 * ---
 * ⚠️ ĐÂY KHÔNG PHẢI LỚP BẢO VỆ
 *
 * Middleware chỉ lo phần TRẢI NGHIỆM (gia hạn, chuyển hướng). Quyền truy cập
 * do `apps/api` quyết định, ở mọi request. Đừng bao giờ dựa vào middleware để
 * chặn ai đó — nó không nhìn thấy dữ liệu, và một request gọi thẳng vào API sẽ
 * không đi qua đây.
 */

/** Trang không cần đăng nhập. */
const PUBLIC_PATHS = [
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/auth/callback",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;

  // Còn access token thì không có việc gì để làm ở đây.
  if (accessToken) return NextResponse.next();

  if (refreshToken) {
    const refreshed = await refreshSession(refreshToken);

    if (refreshed) {
      const response = NextResponse.next();
      applyTokens(response, refreshed);
      return response;
    }

    // Refresh token không dùng được nữa (hết hạn, bị thu hồi, hoặc bị phát
    // hiện dùng lại). Xoá sạch cookie — giữ lại chỉ khiến mọi request sau đó
    // đều thử refresh rồi thất bại.
    const response = isPublic(pathname)
      ? NextResponse.next()
      : NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(pathname)}`, request.url));

    response.cookies.delete(ACCESS_TOKEN_COOKIE);
    response.cookies.delete(REFRESH_TOKEN_COOKIE);
    return response;
  }

  if (isPublic(pathname)) return NextResponse.next();

  return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(pathname)}`, request.url));
}

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

type TokenPairLike = {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: string;
};

/**
 * Hạn chờ khi gia hạn token.
 *
 * NGẮN hơn hẳn timeout của `apiFetch` (10 giây), và đó là chủ đích: middleware
 * chạy trên MỌI request, kể cả tới trang tĩnh. API treo mà chỗ này chờ lâu thì
 * toàn bộ website đứng im — kể cả những trang không cần dữ liệu gì.
 *
 * Ba giây là mức mà một nhịp gọi trong nội bộ datacenter không bao giờ chạm
 * tới. Quá hạn thì coi như không gia hạn được: người dùng về trang đăng nhập,
 * còn hơn cả site treo.
 */
const REFRESH_TIMEOUT_MS = 3_000;

async function refreshSession(refreshToken: string): Promise<TokenPairLike | null> {
  try {
    const response = await fetch(
      `${process.env.API_URL ?? "http://localhost:3001"}/api/v1/auth/refresh`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
        cache: "no-store",
        // Không có dòng này thì `fetch` của Node chờ VÔ HẠN, và một API TREO
        // (còn sống nhưng không trả lời) sẽ kéo sập cả web — nguy hiểm hơn hẳn
        // API chết hẳn, vốn bị từ chối kết nối ngay lập tức.
        signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
      },
    );

    if (!response.ok) return null;

    const body = (await response.json()) as { data?: { tokens?: TokenPairLike } };
    return body.data?.tokens ?? null;
  } catch {
    // API chưa sẵn sàng (đang deploy, mạng chập chờn, hoặc quá hạn chờ). Trả
    // `null` để người dùng về trang đăng nhập, thay vì để middleware ném lỗi và
    // cả trang thành 500.
    return null;
  }
}

function applyTokens(response: NextResponse, tokens: TokenPairLike): void {
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };

  response.cookies.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    ...options,
    maxAge: tokens.expiresIn,
  });

  response.cookies.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    ...options,
    maxAge: Math.max(
      0,
      Math.floor((new Date(tokens.refreshExpiresAt).getTime() - Date.now()) / 1000),
    ),
  });
}

export const config = {
  /*
   * Bỏ qua tài nguyên tĩnh: chạy middleware cho từng file ảnh là tự thêm một
   * lần gọi mạng (thử refresh) vào mỗi tài nguyên trên trang.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|css|js)$).*)",
  ],
};
