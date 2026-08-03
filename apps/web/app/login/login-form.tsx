"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <label htmlFor="email" style={{ display: "block", marginBottom: 4 }}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          aria-invalid={state.fieldErrors?.email ? true : undefined}
          style={{ width: "100%", padding: 8 }}
        />
        {state.fieldErrors?.email && (
          <p style={{ color: "crimson", fontSize: 13 }}>{state.fieldErrors.email[0]}</p>
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
