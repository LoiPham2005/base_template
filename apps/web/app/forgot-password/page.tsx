import type { Metadata } from "next";
import Link from "next/link";
import { linkClass } from "@/lib/ui";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Quên mật khẩu" };

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-12">
      <h1 className="mb-2 text-2xl font-semibold">Quên mật khẩu</h1>
      <p className="mb-6 text-slate-600 dark:text-slate-400">
        Nhập email đã đăng ký, chúng tôi sẽ gửi liên kết đặt lại mật khẩu.
      </p>

      <ForgotPasswordForm />

      <p className="mt-6 text-center text-sm text-slate-500">
        <Link href="/login" className={linkClass}>
          Quay lại đăng nhập
        </Link>
      </p>
    </main>
  );
}
