import type { Metadata } from "next";
import Link from "next/link";
import { linkClass } from "@/lib/ui";
import { VerifyEmailForm } from "./verify-email-form";

export const metadata: Metadata = { title: "Xác thực email" };
export const dynamic = "force-dynamic";

/**
 * Điểm hạ cánh của liên kết trong thư xác thực.
 *
 * ---
 * VÌ SAO XÁC THỰC KHI BẤM NÚT, KHÔNG PHẢI KHI MỞ TRANG
 *
 * Bộ quét liên kết của Gmail/Outlook/Safe Links mở MỌI URL trong thư trước khi
 * người nhận kịp bấm — để kiểm tra mã độc. Token ở đây dùng-một-lần, nên xác
 * thực ngay lúc render nghĩa là bộ quét đốt mất token: người dùng bấm vào thì
 * nhận "liên kết đã hết hạn", và không ai hiểu vì sao.
 *
 * Một cú bấm thêm đổi lấy việc luồng này không hỏng ngẫu nhiên theo nhà cung
 * cấp email — đáng.
 */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-3 px-6">
        <h1 className="text-xl font-semibold">Liên kết không hợp lệ</h1>
        <p className="text-slate-600 dark:text-slate-400">
          Thiếu mã xác thực. Hãy mở lại liên kết trong email.
        </p>
        <Link href="/login" className={linkClass}>
          Tới trang đăng nhập
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold">Xác thực email</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">Bấm nút bên dưới để hoàn tất.</p>
      </div>

      <VerifyEmailForm token={token} />
    </main>
  );
}
