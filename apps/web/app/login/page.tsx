import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccessToken } from "@/lib/session";
import { LoginForm } from "./login-form";
import { PasskeyButton } from "./passkey-button";

export const metadata: Metadata = { title: "Đăng nhập" };
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; emailChange?: string }>;
}) {
  // Đã đăng nhập thì không cần vào đây nữa.
  if (await getAccessToken()) redirect("/users");

  const { next, emailChange } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-12">
      <h1 className="mb-6 text-2xl font-semibold">Đăng nhập</h1>

      {emailChange && <EmailChangeNotice status={emailChange} />}

      <LoginForm next={next} />

      <div className="my-6 flex items-center gap-3 text-sm text-slate-400">
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
        hoặc
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
      </div>

      {/* Tự ẩn trên trình duyệt không hỗ trợ WebAuthn. */}
      <PasskeyButton next={next} />
    </main>
  );
}

/** Kết quả của luồng đổi email — người dùng vừa bị đăng xuất khỏi mọi thiết bị. */
function EmailChangeNotice({ status }: { status: string }) {
  const messages: Record<string, { text: string; tone: "ok" | "error" }> = {
    ok: {
      text: "Đã đổi địa chỉ email. Mọi thiết bị đã được đăng xuất — hãy đăng nhập lại bằng email mới.",
      tone: "ok",
    },
    conflict: {
      text: "Địa chỉ email đó vừa có người khác đăng ký. Hãy thử một địa chỉ khác.",
      tone: "error",
    },
    invalid: { text: "Liên kết xác nhận không hợp lệ hoặc đã hết hạn.", tone: "error" },
    error: { text: "Không hoàn tất được yêu cầu đổi email. Vui lòng thử lại.", tone: "error" },
  };

  const message = messages[status];
  if (!message) return null;

  return (
    <p
      role="status"
      className={
        message.tone === "ok"
          ? "mb-4 rounded-md bg-brand-50 p-3 text-sm text-brand-900 dark:bg-brand-900/30 dark:text-brand-100"
          : "mb-4 rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200"
      }
    >
      {message.text}
    </p>
  );
}
