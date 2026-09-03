import type { Metadata } from "next";
import { confirmEmailChangeAction } from "./actions";

export const metadata: Metadata = { title: "Xác nhận đổi email" };
export const dynamic = "force-dynamic";

/**
 * Điểm hạ cánh của link gửi tới địa chỉ email MỚI.
 *
 * ---
 * VÌ SAO XÁC NHẬN KHI BẤM NÚT, KHÔNG PHẢI KHI MỞ TRANG
 *
 * Bộ quét link của Gmail/Outlook mở mọi URL trong thư trước khi người nhận kịp
 * bấm. Token ở đây dùng-một-lần, nên xác nhận ngay lúc render nghĩa là bộ quét
 * đốt mất token — người dùng bấm vào thì nhận được "liên kết đã hết hạn", và
 * không ai hiểu vì sao.
 */
export default async function ConfirmEmailChangePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <main style={{ padding: 24, maxWidth: 420, fontFamily: "system-ui, sans-serif" }}>
        <h1>Liên kết không hợp lệ</h1>
        <p>Thiếu mã xác nhận. Hãy mở lại liên kết trong email.</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 420, fontFamily: "system-ui, sans-serif" }}>
      <h1>Xác nhận đổi địa chỉ email</h1>
      <p>
        Bấm nút dưới đây để hoàn tất. Sau khi đổi, <strong>mọi thiết bị sẽ bị đăng xuất</strong> —
        email là danh tính khôi phục tài khoản, nên đổi nó xong mà để phiên cũ sống tiếp là để ngỏ
        đúng thứ vừa được bảo vệ.
      </p>

      <form action={confirmEmailChangeAction}>
        <input type="hidden" name="token" value={token} />
        <button type="submit" style={{ padding: 10 }}>
          Xác nhận đổi email
        </button>
      </form>
    </main>
  );
}
