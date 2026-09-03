"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Trang người dùng định vào trước khi bị chuyển tới đây. */}
      <input type="hidden" name="next" value={next ?? "/users"} />

      <div>
        <label htmlFor="identifier" style={{ display: "block", marginBottom: 4 }}>
          Email hoặc tên đăng nhập
        </label>
        {/* Một ô cho cả hai: người dùng không nhớ mình đã đăng ký bằng đường
            nào. API phân biệt bằng ký tự "@". */}
        <input
          id="identifier"
          name="identifier"
          type="text"
          required
          autoComplete="username"
          aria-invalid={state.fieldErrors?.identifier ? true : undefined}
          style={{ width: "100%", padding: 8 }}
        />
        {state.fieldErrors?.identifier && (
          <p style={{ color: "crimson", fontSize: 13 }}>{state.fieldErrors.identifier[0]}</p>
        )}
      </div>

      <div>
        <label htmlFor="password" style={{ display: "block", marginBottom: 4 }}>
          Mật khẩu
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          aria-invalid={state.fieldErrors?.password ? true : undefined}
          style={{ width: "100%", padding: 8 }}
        />
        {state.fieldErrors?.password && (
          <p style={{ color: "crimson", fontSize: 13 }}>{state.fieldErrors.password[0]}</p>
        )}
      </div>

      {state.error && (
        <p role="alert" style={{ color: "crimson" }}>
          {state.error}
        </p>
      )}

      <button type="submit" disabled={isPending} style={{ padding: 10 }}>
        {isPending ? "Đang đăng nhập…" : "Đăng nhập"}
      </button>
    </form>
  );
}
