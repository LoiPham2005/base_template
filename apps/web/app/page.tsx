import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold">Base Template</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-400">Next.js + NestJS + Prisma monorepo.</p>

      <div className="card mt-8">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Trang này là tĩnh — nó vẫn hiển thị bình thường ngay cả khi API không phản hồi. Mọi trang
          cần dữ liệu sẽ hiện thông báo gián đoạn thay vì trang lỗi trần.
        </p>
        <Link
          href="/users"
          className="mt-4 inline-block text-brand-600 underline hover:text-brand-700"
        >
          Xem ví dụ danh sách người dùng →
        </Link>
      </div>
    </main>
  );
}
