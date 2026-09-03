"use client";

import { useActionState } from "react";
import { inputClass, primaryButtonClass } from "@/lib/ui";
import { forgotPasswordAction, type ForgotPasswordState } from "./actions";

const initialState: ForgotPasswordState = {};

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(forgotPasswordAction, initialState);

  if (state.done) {
    return (
      <div className="card">
        <h2 className="font-medium">Đã gửi (nếu email tồn tại)</h2>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Kiểm tra hộp thư và bấm vào liên kết để đặt lại mật khẩu. Liên kết chỉ dùng được một lần.
        </p>
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
          autoFocus
          autoComplete="email"
          className={inputClass}
        />
        {state.fieldErrors?.email && <p className="field-error">{state.fieldErrors.email[0]}</p>}
      </div>

      {state.error && (
        <p role="alert" className="field-error">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={isPending} className={primaryButtonClass}>
        {isPending ? "Đang gửi…" : "Gửi liên kết đặt lại"}
      </button>
    </form>
  );
}
