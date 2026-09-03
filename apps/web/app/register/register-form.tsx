"use client";

import { useActionState } from "react";
import Link from "next/link";
import { inputClass, linkClass, primaryButtonClass } from "@/lib/ui";
import { registerAction, type RegisterState } from "./actions";

const initialState: RegisterState = {};

export function RegisterForm() {
  const [state, formAction, isPending] = useActionState(registerAction, initialState);

  if (state.done) {
    return (
      <div className="card">
        <h2 className="font-medium">Kiểm tra hộp thư của bạn</h2>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Chúng tôi đã gửi một liên kết xác thực. Bấm vào đó để kích hoạt tài khoản.
        </p>
        <Link href="/users" className={`${linkClass} mt-4 inline-block`}>
          Vào hệ thống ngay →
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className={inputClass}
        />
        {state.fieldErrors?.email && <p className="field-error">{state.fieldErrors.email[0]}</p>}
      </div>

      <div>
        <label htmlFor="fullName" className="mb-1 block text-sm font-medium">
          Họ tên <span className="text-slate-400">(tuỳ chọn)</span>
        </label>
        <input id="fullName" name="fullName" autoComplete="name" className={inputClass} />
      </div>

      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">
          Mật khẩu
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          // `new-password` để trình quản lý mật khẩu gợi ý tạo mật khẩu mạnh.
          autoComplete="new-password"
          className={inputClass}
        />
        <p className="mt-1 text-sm text-slate-500">Tối thiểu 8 ký tự.</p>
        {state.fieldErrors?.password && (
          <p className="field-error">{state.fieldErrors.password[0]}</p>
        )}
      </div>

      {state.error && (
        <p role="alert" className="field-error">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={isPending} className={primaryButtonClass}>
        {isPending ? "Đang tạo tài khoản…" : "Đăng ký"}
      </button>
    </form>
  );
}
