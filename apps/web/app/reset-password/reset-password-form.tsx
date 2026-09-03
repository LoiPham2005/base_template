"use client";

import { useActionState } from "react";
import Link from "next/link";
import { inputClass, linkClass, primaryButtonClass } from "@/lib/ui";
import { resetPasswordAction, type ResetPasswordState } from "./actions";

const initialState: ResetPasswordState = {};

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, isPending] = useActionState(resetPasswordAction, initialState);

  if (state.done) {
    return (
      <div className="card">
        <h2 className="font-medium">Đã đổi mật khẩu</h2>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Mọi thiết bị đang đăng nhập đã bị đăng xuất — kể cả thiết bị của người đã chiếm tài khoản,
          nếu có.
        </p>
        <Link href="/login" className={`${linkClass} mt-4 inline-block`}>
          Đăng nhập lại →
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />

      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">
          Mật khẩu mới
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoFocus
          autoComplete="new-password"
          className={inputClass}
        />
        <p className="mt-1 text-sm text-slate-500">Tối thiểu 8 ký tự.</p>
        {state.fieldErrors?.password && (
          <p className="field-error">{state.fieldErrors.password[0]}</p>
        )}
      </div>

      <div>
        <label htmlFor="passwordConfirm" className="mb-1 block text-sm font-medium">
          Nhập lại mật khẩu mới
        </label>
        {/* Ô xác nhận chỉ tồn tại ở giao diện: người dùng không nhìn thấy thứ
            mình gõ, và gõ nhầm ở đây nghĩa là mất tài khoản. API không cần nó. */}
        <input
          id="passwordConfirm"
          name="passwordConfirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={inputClass}
        />
      </div>

      {state.error && (
        <p role="alert" className="field-error">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={isPending} className={primaryButtonClass}>
        {isPending ? "Đang đổi…" : "Đặt mật khẩu mới"}
      </button>
    </form>
  );
}
