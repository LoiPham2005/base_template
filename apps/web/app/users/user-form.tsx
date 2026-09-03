"use client";

import { useActionState } from "react";
import { createUserAction, type CreateUserState } from "./actions";

const initialState: CreateUserState = {};

const inputClass =
  "rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900 dark:focus:ring-brand-900";

export function UserForm() {
  const [state, formAction, isPending] = useActionState(createUserAction, initialState);

  return (
    <form action={formAction} className="card flex flex-wrap items-start gap-3">
      <input name="email" type="email" placeholder="email" required className={inputClass} />
      <input name="fullName" placeholder="họ tên (tuỳ chọn)" className={inputClass} />
      {/* Để trống thì tài khoản được tạo mà CHƯA có mật khẩu — người dùng tự
          đặt qua luồng "quên mật khẩu", vốn chấp nhận trường hợp này. */}
      <input
        name="password"
        type="password"
        placeholder="mật khẩu (tuỳ chọn, ≥8 ký tự)"
        minLength={8}
        className={inputClass}
      />
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {isPending ? "Đang thêm…" : "Thêm người dùng"}
      </button>

      <div className="w-full">
        {state.error && <p className="field-error">{state.error}</p>}
        {state.fieldErrors?.email && <p className="field-error">{state.fieldErrors.email[0]}</p>}
        {state.fieldErrors?.password && (
          <p className="field-error">{state.fieldErrors.password[0]}</p>
        )}
      </div>
    </form>
  );
}
