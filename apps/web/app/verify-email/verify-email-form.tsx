"use client";

import { useActionState } from "react";
import Link from "next/link";
import { linkClass, primaryButtonClass } from "@/lib/ui";
import { verifyEmailAction, type VerifyEmailState } from "./actions";

const initialState: VerifyEmailState = {};

export function VerifyEmailForm({ token }: { token: string }) {
  const [state, formAction, isPending] = useActionState(verifyEmailAction, initialState);

  if (state.status === "ok") {
    return (
      <div className="card">
        <h2 className="font-medium">Đã xác thực email</h2>
        <p className="mt-2 text-slate-600 dark:text-slate-400">Tài khoản của bạn đã sẵn sàng.</p>
        <Link href="/users" className={`${linkClass} mt-4 inline-block`}>
          Vào hệ thống →
        </Link>
      </div>
    );
  }

  if (state.status === "invalid" || state.status === "error") {
    return (
      <div className="card">
        <h2 className="font-medium">Liên kết không dùng được</h2>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          {state.status === "invalid"
            ? "Liên kết đã hết hạn hoặc không hợp lệ. Đăng nhập rồi yêu cầu gửi lại thư xác thực."
            : "Hệ thống đang gián đoạn. Bạn thử lại sau ít phút giúp nhé."}
        </p>
        <Link href="/login" className={`${linkClass} mt-4 inline-block`}>
          Tới trang đăng nhập
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="token" value={token} />
      <button type="submit" disabled={isPending} className={primaryButtonClass}>
        {isPending ? "Đang xác thực…" : "Xác thực email của tôi"}
      </button>
    </form>
  );
}
