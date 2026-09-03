"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { getPasskeyLoginOptions, verifyPasskeyLogin } from "./passkey-actions";

/**
 * Nút "Đăng nhập bằng passkey".
 *
 * Không cần nhập email: trình duyệt tự hiện mọi passkey đã lưu cho tên miền
 * này, người dùng chọn một cái rồi mở khoá bằng vân tay/Face ID. Một chạm, và
 * an toàn hơn mật khẩu + TOTP cộng lại — vì trang giả không xin được chữ ký.
 */
export function PasskeyButton({ next }: { next?: string }) {
  const router = useRouter();
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Kiểm tra trong `useEffect` chứ không phải lúc render: `window` không tồn
    // tại khi Next render phía server, và một nút "đăng nhập bằng passkey"
    // hiện trên trình duyệt không hỗ trợ chỉ dẫn tới ngõ cụt.
    void import("@simplewebauthn/browser").then(({ browserSupportsWebAuthn }) => {
      setSupported(browserSupportsWebAuthn());
    });
  }, []);

  if (!supported) return null;

  async function handleClick() {
    setBusy(true);
    setError(null);

    try {
      const { startAuthentication } = await import("@simplewebauthn/browser");
      const { options, challengeToken } = await getPasskeyLoginOptions();

      // Bước này mở secure enclave của thiết bị. Trình duyệt CHỈ ký cho đúng
      // tên miền đã đăng ký — đó là toàn bộ lý do passkey chống được phishing.
      /*
       * Ép kiểu qua `unknown`: `options` được khai là `Record<string, unknown>`
       * vì nó đi qua ranh giới Server Action (JSON thuần), còn thư viện muốn
       * `PublicKeyCredentialRequestOptionsJSON`.
       *
       * Không mô tả lại cấu trúc đó bằng Zod ở `@repo/contracts` là có chủ
       * đích — đặc tả WebAuthn còn đang tiến hoá, và một bản chép tay sẽ bắt
       * đầu từ chối những trình duyệt hợp lệ. Giá trị này do CHÍNH máy chủ của
       * ta sinh ra ở bước `/login/options`, nên nó không phải dữ liệu không tin
       * được.
       */
      const response = await startAuthentication({
        optionsJSON: options as unknown as Parameters<typeof startAuthentication>[0]["optionsJSON"],
      });

      const result = await verifyPasskeyLogin(challengeToken, response, next);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      router.push(result.next as Route);
      // Server Component đọc cookie phiên vừa được đặt — không refresh thì
      // trang đích vẫn render theo trạng thái "chưa đăng nhập".
      router.refresh();
    } catch (err) {
      // Người dùng bấm Huỷ ở hộp thoại hệ điều hành cũng rơi vào đây. Không
      // phải lỗi — đừng hét lên.
      const name = err instanceof Error ? err.name : "";
      if (name !== "NotAllowedError" && name !== "AbortError") {
        setError("Không dùng được passkey trên thiết bị này.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={busy}
        className="w-full rounded-md border border-slate-300 px-4 py-2 font-medium hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
      >
        {busy ? "Đang chờ thiết bị…" : "🔑 Đăng nhập bằng passkey"}
      </button>

      <p className="mt-2 text-center text-sm text-slate-500">
        Không cần nhập email. Mở khoá bằng vân tay hoặc Face ID.
      </p>

      {error && (
        <p role="alert" className="field-error text-center">
          {error}
        </p>
      )}
    </div>
  );
}
