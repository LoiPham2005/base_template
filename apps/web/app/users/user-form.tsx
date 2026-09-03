"use client";

import { useActionState } from "react";
import { createUserAction, type CreateUserState } from "./actions";

const initialState: CreateUserState = {};

export function UserForm() {
  const [state, formAction, isPending] = useActionState(createUserAction, initialState);

  return (
    <form
      action={formAction}
      style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}
    >
      <input name="email" type="email" placeholder="email" required />
      <input name="fullName" placeholder="họ tên (tuỳ chọn)" />
      {/* Để trống thì tài khoản được tạo mà CHƯA có mật khẩu — người dùng tự
          đặt qua luồng "quên mật khẩu", vốn chấp nhận trường hợp này. */}
      <input
        name="password"
        type="password"
        placeholder="mật khẩu (tuỳ chọn, ≥8 ký tự)"
        minLength={8}
      />
      <button type="submit" disabled={isPending}>
        {isPending ? "Đang thêm…" : "Thêm người dùng"}
      </button>

      {state.error && <span style={{ color: "crimson" }}>{state.error}</span>}
      {state.fieldErrors?.email && (
        <span style={{ color: "crimson" }}>{state.fieldErrors.email[0]}</span>
      )}
      {state.fieldErrors?.password && (
        <span style={{ color: "crimson" }}>{state.fieldErrors.password[0]}</span>
      )}
    </form>
  );
}
