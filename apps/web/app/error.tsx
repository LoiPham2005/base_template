"use client";

import { useEffect } from "react";

/**
 * Ranh giới lỗi cho toàn bộ route.
 *
 * ---
 * VÌ SAO FILE NÀY QUAN TRỌNG HƠN VẺ NGOÀI CỦA NÓ
 *
 * Không có nó, một lỗi ở Server Component (ví dụ API không phản hồi) sẽ dẫn tới
 * trang lỗi mặc định của Next.js — trên production là một dòng "Application
 * error: a server-side exception has occurred" trên nền trắng, kèm một mã
 * digest vô nghĩa với người dùng.
 *
 * Về mặt kỹ thuật web KHÔNG sập: tiến trình vẫn sống, trang tĩnh vẫn phục vụ.
 * Nhưng với người dùng thì không có khác biệt nào giữa "trang lỗi trần" và
 * "sập". File này biến sự cố của backend thành một thông báo đọc được, kèm nút
 * thử lại.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    /*
     * Ngoại lệ hợp lệ duy nhất của luật "không dùng console".
     *
     * `logger` của `@repo/core` chỉ chạy phía server, và `apps/web` cũng không
     * được phép import nó. Ranh giới lỗi này còn bắt cả lỗi render PHÍA CLIENT
     * — thứ mà server không bao giờ thấy — nên console trình duyệt là nơi duy
     * nhất lập trình viên nhìn được. Chỉ ở dev; production thì im lặng.
     */
    // eslint-disable-next-line no-console
    if (process.env.NODE_ENV !== "production") console.error(error);
  }, [error]);

  /*
   * Nhận diện "API không phản hồi" để nói đúng chuyện.
   *
   * So theo `name` chứ không phải `instanceof`: lỗi từ Server Component được
   * tuần tự hoá trước khi tới client, nên nguyên mẫu (prototype) không sống sót
   * — `instanceof ApiUnavailableError` ở đây LUÔN sai. Trên production Next còn
   * xoá cả `message`, nên `name` là thứ duy nhất còn đáng tin.
   */
  const isBackendDown = error.name === "ApiUnavailableError";

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6">
      <h1 className="text-xl font-semibold">
        {isBackendDown ? "Hệ thống đang tạm gián đoạn" : "Đã có lỗi xảy ra"}
      </h1>

      <p className="text-slate-600 dark:text-slate-400">
        {isBackendDown
          ? "Máy chủ dữ liệu chưa phản hồi. Thường là do đang cập nhật — bạn thử lại sau ít phút giúp nhé."
          : "Chúng tôi đã ghi nhận sự cố này. Bạn thử tải lại trang xem sao."}
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-brand-600 px-4 py-2 text-white hover:bg-brand-700"
        >
          Thử lại
        </button>
        <a
          href="/"
          className="rounded-md border border-slate-300 px-4 py-2 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          Về trang chủ
        </a>
      </div>

      {/* Mã để người dùng đọc cho bộ phận hỗ trợ — nối thẳng tới dòng log. */}
      {error.digest && (
        <p className="text-xs text-slate-400">
          Mã sự cố: <code>{error.digest}</code>
        </p>
      )}
    </main>
  );
}
