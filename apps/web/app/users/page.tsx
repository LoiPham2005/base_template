import { redirect } from "next/navigation";
import type { Paginated, PublicUser } from "@repo/contracts";
import { apiFetch, ApiError } from "@/lib/api";
import { logoutAction } from "../login/actions";
import { UserForm } from "./user-form";

// Dữ liệu thay đổi theo người dùng và theo request — không bao giờ prerender.
export const dynamic = "force-dynamic";

/**
 * Server Component gọi `apps/api` qua HTTP, đúng endpoint mà app mobile gọi.
 * Vẫn render/stream ở server; nhịp gọi mạng nằm trong nội bộ datacenter, không
 * phải trên trình duyệt người dùng.
 */
export default async function UsersPage() {
  let page: Paginated<PublicUser>;

  try {
    page = await apiFetch<Paginated<PublicUser>>("/users?page=1&limit=20");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      // Token vừa bị thu hồi giữa chừng. `middleware.ts` lo phần gia hạn thông
      // thường; tới được đây nghĩa là cả refresh cũng không còn dùng được.
      redirect("/login");
    }

    if (error instanceof ApiError && error.status === 403) {
      return (
        <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
          <h1>Không có quyền</h1>
          <p>
            Trang này cần quyền <code>user:read</code>. Liên hệ quản trị viên để được cấp.
          </p>
          <form action={logoutAction}>
            <button type="submit">Đăng xuất</button>
          </form>
        </main>
      );
    }

    throw error;
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Người dùng ({page.meta.total})</h1>
        <form action={logoutAction}>
          <button type="submit">Đăng xuất</button>
        </form>
      </div>

      <UserForm />

      <ul>
        {page.items.map((user) => (
          <li key={user.id}>
            {user.email ?? user.username ?? user.phone}
            {user.fullName ? ` — ${user.fullName}` : ""}
            <span style={{ color: "#666", marginLeft: 8, fontSize: 13 }}>
              [{user.roles.join(", ") || "chưa có vai trò"}] · {user.status}
            </span>
          </li>
        ))}
      </ul>

      {page.items.length === 0 && <p>Chưa có người dùng nào.</p>}
    </main>
  );
}
