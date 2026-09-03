import { redirect } from "next/navigation";
import type { Paginated, PublicUser } from "@repo/contracts";
import { apiFetch, ApiError, ApiUnavailableError } from "@/lib/api";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { logoutAction } from "../login/actions";
import { UserForm } from "./user-form";

// Dữ liệu thay đổi theo người dùng và theo request — không bao giờ prerender.
export const dynamic = "force-dynamic";

/**
 * Server Component gọi `apps/api` qua HTTP, đúng endpoint mà app mobile gọi.
 * Vẫn render/stream ở server; nhịp gọi mạng nằm trong nội bộ datacenter, không
 * phải trên trình duyệt người dùng.
 *
 * Ba nhánh lỗi, ba màn hình khác nhau:
 *
 *   • API không phản hồi  → `<ServiceUnavailable />`, render ngay trong HTML
 *   • 401                 → về trang đăng nhập
 *   • 403                 → nói rõ thiếu quyền gì
 *
 * Bắt `ApiUnavailableError` ngay tại đây thay vì để bung lên `app/error.tsx`:
 * error boundary của Next là Client Component, nên nó chỉ hiện SAU khi
 * JavaScript hydrate. `error.tsx` vẫn giữ vai trò lưới an toàn cho những trang
 * chưa bắt.
 */
export default async function UsersPage() {
  let page: Paginated<PublicUser>;

  try {
    page = await apiFetch<Paginated<PublicUser>>("/users?page=1&limit=20");
  } catch (error) {
    if (error instanceof ApiUnavailableError) return <ServiceUnavailable />;

    if (error instanceof ApiError && error.status === 401) {
      // Token vừa bị thu hồi giữa chừng. `middleware.ts` lo phần gia hạn thông
      // thường; tới được đây nghĩa là cả refresh cũng không còn dùng được.
      redirect("/login");
    }

    if (error instanceof ApiError && error.status === 403) {
      return (
        <main className="mx-auto max-w-2xl px-6 py-12">
          <h1 className="text-xl font-semibold">Không có quyền</h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            Trang này cần quyền{" "}
            <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">user:read</code>. Liên hệ
            quản trị viên để được cấp.
          </p>
          <form action={logoutAction} className="mt-4">
            <button
              type="submit"
              className="rounded-md border border-slate-300 px-4 py-2 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Đăng xuất
            </button>
          </form>
        </main>
      );
    }

    throw error;
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Người dùng ({page.meta.total})</h1>
        <form action={logoutAction}>
          <button
            type="submit"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Đăng xuất
          </button>
        </form>
      </div>

      <div className="mt-6">
        <UserForm />
      </div>

      <ul className="mt-6 divide-y divide-slate-200 dark:divide-slate-800">
        {page.items.map((user) => (
          <li key={user.id} className="flex flex-wrap items-center gap-x-3 py-3">
            <span className="font-medium">{user.email ?? user.username ?? user.phone}</span>
            {user.fullName && (
              <span className="text-slate-600 dark:text-slate-400">{user.fullName}</span>
            )}
            <span className="ml-auto flex items-center gap-2 text-sm">
              <span className="rounded bg-slate-100 px-2 py-0.5 dark:bg-slate-800">
                {user.roles.join(", ") || "chưa có vai trò"}
              </span>
              {user.twoFactorEnabled && (
                <span
                  title="Đã bật xác thực hai lớp"
                  className="rounded bg-brand-100 px-2 py-0.5 text-brand-900"
                >
                  2FA
                </span>
              )}
              <span className="text-slate-500">{user.status}</span>
            </span>
          </li>
        ))}
      </ul>

      {page.items.length === 0 && (
        <p className="mt-6 text-slate-600 dark:text-slate-400">Chưa có người dùng nào.</p>
      )}
    </main>
  );
}
