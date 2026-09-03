"use client";

import { useActionState } from "react";
import { loginAction, verifyTwoFactorAction, type LoginState } from "./actions";

const initialState: LoginState = {};

/**
 * Form đăng nhập, hai bước.
 *
 * Bước hai chỉ xuất hiện khi API trả về vé 2FA — tức là mật khẩu ĐÃ đúng. Giữ
 * cả hai bước trong một component để vé không phải đi qua URL hay
 * `sessionStorage`: nó sống trong một input ẩn, mất đi khi người dùng rời trang,
 * đúng như mong muốn.
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
      <form action={twoFactorAction} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input type="hidden" name="challengeToken" value={challengeToken} />
        <input type="hidden" name="next" value={next ?? "/users"} />

        <div>
          <label htmlFor="code" style={{ display: "block", marginBottom: 4 }}>
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
            inputMode="text"
            placeholder="6 chữ số, hoặc mã khôi phục"
            style={{ width: "100%", padding: 8 }}
          />
          <p style={{ color: "#666", fontSize: 13, marginTop: 4 }}>
            Mở ứng dụng xác thực để lấy mã. Mất điện thoại? Dùng một mã khôi phục đã lưu.
          </p>
        </div>

        {twoFactorState.error && (
          <p role="alert" style={{ color: "crimson" }}>
            {twoFactorState.error}
          </p>
        )}

        <button type="submit" disabled={isVerifying} style={{ padding: 10 }}>
          {isVerifying ? "Đang xác thực…" : "Xác thực"}
        </button>
      </form>
    );
  }

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
