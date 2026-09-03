import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6">
      <h1 className="text-xl font-semibold">Không tìm thấy trang</h1>
      <p className="text-slate-600 dark:text-slate-400">
        Đường dẫn bạn mở không tồn tại hoặc đã được đổi.
      </p>
      <Link href="/" className="text-brand-600 underline hover:text-brand-700">
        Về trang chủ
      </Link>
    </main>
  );
}
