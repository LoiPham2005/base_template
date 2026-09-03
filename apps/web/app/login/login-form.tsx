"use client";

import { useActionState } from "react";
import { loginAction, verifyTwoFactorAction, type LoginState } from "./actions";

const initialState: LoginState = {};

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900 dark:focus:ring-brand-900";

const buttonClass =
  "w-full rounded-md bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-60";

/**
 * Form đăng nhập, hai bước.
 *
 * Bước hai chỉ xuất hiện khi API trả về vé 2FA — tức là mật khẩu ĐÃ đúng. Giữ
 * cả hai bước trong một component để vé không phải đi qua URL hay
 * `sessionStorage`: nó sống trong một input ẩn, mất đi khi người dùng rời
 * trang, đúng như mong muốn.
 */
export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);
  const [twoFactorState, twoFactorAction, isVerifying] = useActionState(
    verifyTwoFactorAction,
    initialState,
  );

  // Vé mới nhất: sau một lần nhập mã sai, `twoFactorState` giữ lại vé cũ.
  const challengeToken = twoFactorState.challengeToken ?? state.challengeToken;

  if (challengeToken) {
    return (
      <form action={twoFactorAction} className="flex flex-col gap-4">
        <input type="hidden" name="challengeToken" value={challengeToken} />
        <input type="hidden" name="next" value={next ?? "/users"} />

        <div>
          <label htmlFor="code" className="mb-1 block text-sm font-medium">
            Mã xác thực
          </label>
          <input
            id="code"
            name="code"
            type="text"
            required
            autoFocus
            // `one-time-code` để iOS/Android tự điền mã từ app xác thực.
            autoComplete="one-time-code"
            placeholder="6 chữ số, hoặc mã khôi phục"
            className={inputClass}
          />
          <p className="mt-1 text-sm text-slate-500">
            Mở ứng dụng xác thực để lấy mã. Mất điện thoại? Dùng một mã khôi phục đã lưu.
          </p>
        </div>

        {twoFactorState.error && (
          <p role="alert" className="field-error">
            {twoFactorState.error}
          </p>
        )}

        <button type="submit" disabled={isVerifying} className={buttonClass}>
          {isVerifying ? "Đang xác thực…" : "Xác thực"}
        </button>
      </form>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {/* Trang người dùng định vào trước khi bị chuyển tới đây. */}
      <input type="hidden" name="next" value={next ?? "/users"} />

      <div>
        <label htmlFor="identifier" className="mb-1 block text-sm font-medium">
          Email hoặc tên đăng nhập
        </label>
        {/* Một ô cho cả hai: người dùng không nhớ mình đã đăng ký bằng đường
            nào. API phân biệt bằng ký tự "@". */}
        <input
          id="identifier"
          name="identifier"
          type="text"
          required
          autoComplete="username webauthn"
          aria-invalid={state.fieldErrors?.identifier ? true : undefined}
          className={inputClass}
        />
        {state.fieldErrors?.identifier && (
          <p className="field-error">{state.fieldErrors.identifier[0]}</p>
        )}
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
          autoComplete="current-password"
          aria-invalid={state.fieldErrors?.password ? true : undefined}
          className={inputClass}
        />
        {state.fieldErrors?.password && (
          <p className="field-error">{state.fieldErrors.password[0]}</p>
        )}
      </div>

      {state.error && (
        <p role="alert" className="field-error">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={isPending} className={buttonClass}>
        {isPending ? "Đang đăng nhập…" : "Đăng nhập"}
      </button>
    </form>
  );
}
