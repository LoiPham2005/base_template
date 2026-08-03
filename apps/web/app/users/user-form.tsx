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
      <input name="name" placeholder="name (optional)" />
      {/* Ô này trước đây không tồn tại, trong khi schema lại bắt buộc password
          — nên form chưa bao giờ gửi thành công, và lỗi "password: Required"
          cũng không có chỗ nào hiển thị. Nay password là tuỳ chọn: để trống
          thì tài khoản được tạo mà chưa có mật khẩu. */}
      <input
        name="password"
        type="password"
        placeholder="password (tuỳ chọn, ≥8 ký tự)"
        minLength={8}
      />
      <button type="submit" disabled={isPending}>
        {isPending ? "Adding…" : "Add user"}
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
