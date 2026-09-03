import type { Metadata } from "next";
import Link from "next/link";
import { linkClass } from "@/lib/ui";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Đặt lại mật khẩu" };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
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
          Thiếu mã đặt lại. Hãy mở lại liên kết trong email, hoặc yêu cầu liên kết mới.
        </p>
        <Link href="/forgot-password" className={linkClass}>
          Gửi lại liên kết
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-12">
      <h1 className="mb-6 text-2xl font-semibold">Đặt mật khẩu mới</h1>
      <ResetPasswordForm token={token} />
    </main>
  );
}
