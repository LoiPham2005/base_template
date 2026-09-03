import Link from "next/link";

/**
 * Màn hình "backend đang gián đoạn", render Ở SERVER.
 *
 * ---
 * VÌ SAO CẦN CẢ CÁI NÀY LẪN `app/error.tsx`
 *
 * `error.tsx` bắt buộc phải là Client Component (React yêu cầu vậy với error
 * boundary). Nghĩa là HTML đầu tiên trả về chỉ là một cái vỏ, và thông báo chỉ
 * xuất hiện SAU KHI JavaScript tải xong và hydrate. Nhanh, nhưng:
 *
 *   • Người dùng mạng chậm thấy trang trắng trong khoảnh khắc đó.
 *   • Trình duyệt tắt JS, hoặc bot, thấy trang trắng vĩnh viễn.
 *
 * Component này render ngay trong HTML đầu tiên. Dùng nó ở những trang bạn
 * quan tâm; `error.tsx` vẫn giữ vai trò lưới an toàn cho mọi trang còn lại —
 * kể cả trang bạn viết sau này mà quên bắt lỗi.
 *
 * ⚠️ Trang dùng component này trả về HTTP 200 (nó render thành công, chỉ là nội
 * dung nói về sự cố). Đừng dùng mã HTTP của trang web để giám sát backend —
 * dùng `GET /api/v1/health/ready` của API, nơi trả 503 thật.
 */
export function ServiceUnavailable({
  title,
  description,
}: {
  title?: string;
  description?: string;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6">
      <h1 className="text-xl font-semibold">{title ?? "Hệ thống đang tạm gián đoạn"}</h1>

      <p className="text-slate-600 dark:text-slate-400">
        {description ??
          "Máy chủ dữ liệu chưa phản hồi. Thường là do đang cập nhật — bạn thử lại sau ít phút giúp nhé."}
      </p>

      <div className="flex gap-2">
        {/* Thẻ `<a>` thuần, KHÔNG phải `<Link>`: điều hướng phía client sẽ
            render lại từ cache và có thể hiện y nguyên trang lỗi này. Cần một
            lần tải lại thật. */}
        <a
          href="/users"
          className="rounded-md bg-brand-600 px-4 py-2 text-white hover:bg-brand-700"
        >
          Thử lại
        </a>
        <Link
          href="/"
          className="rounded-md border border-slate-300 px-4 py-2 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          Về trang chủ
        </Link>
      </div>
    </main>
  );
}
