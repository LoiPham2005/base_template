import { redirect } from "next/navigation";
import type { Route } from "next";
import type { TokenPair } from "@repo/contracts";
import { apiFetch, ApiError } from "@/lib/api";
import { setSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Điểm hạ cánh sau khi đăng nhập bằng Google/GitHub/Facebook/Apple.
 *
 * ---
 * VÌ SAO PHẢI CÓ MỘT BƯỚC ĐỔI MÃ
 *
 * Nhà cung cấp redirect TRÌNH DUYỆT về `apps/api`, và API không đặt được cookie
 * cho tên miền của web (khác origin). Nó cũng KHÔNG được nhét access token vào
 * URL: URL nằm lại trong lịch sử trình duyệt, trong log của reverse proxy, và
 * trong header `Referer` gửi kèm mọi ảnh trên trang kế tiếp.
 *
 * Nên API trả về một MÃ MỘT LẦN, hạn 2 phút. Trang này đổi mã đó lấy token
 * thật ở phía server, ghi vào cookie httpOnly, rồi chuyển hướng đi. Mã đã dùng
 * thì hết giá trị, và nó chưa bao giờ chạm tới JavaScript trong trình duyệt.
 */
export default async function OAuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; error?: string }>;
}) {
  const { code, error } = await searchParams;

  // Người dùng bấm "Huỷ" ở màn hình của nhà cung cấp, hoặc luồng hỏng giữa
  // chừng. Đưa họ về trang đăng nhập với thông điệp bình thường.
  if (error || !code) {
    redirect(`/login?error=${encodeURIComponent(error ?? "oauth_failed")}` as Route);
  }

  let tokens: TokenPair;
  try {
    tokens = await apiFetch<TokenPair>("/auth/oauth/exchange", {
      method: "POST",
      body: JSON.stringify({ code }),
      token: null,
    });
  } catch (err) {
    // Mã hết hạn (người dùng để tab mở quá lâu) hoặc đã bị dùng rồi.
    const reason = err instanceof ApiError ? "oauth_expired" : "oauth_failed";
    redirect(`/login?error=${reason}` as Route);
  }

  await setSession(tokens);
  redirect("/users");
}
