import { z } from "zod";
import { redirect } from "next/navigation";
import { userSchema } from "@repo/contracts";
import { apiFetch, ApiError } from "@/lib/api";
import { getAccessToken } from "@/lib/session";
import { logoutAction } from "../login/actions";
import { UserForm } from "./user-form";

// Mutable, per-request data — never statically prerendered at build time.
export const dynamic = "force-dynamic";

const usersResponseSchema = z.array(userSchema);

// Server Component — calls apps/api over HTTP, the same REST endpoint
// the mobile app hits. Still server-rendered/streamed; the network hop
// stays inside the datacenter, not the user's browser.
export default async function UsersPage() {
  // Kiểm tra sớm chỉ để hiện trang đăng nhập thay vì ném 401 vào mặt người
  // dùng. Đây KHÔNG phải lớp bảo vệ — quyền do apps/api quyết định.
  if (!(await getAccessToken())) {
    redirect("/login");
  }

  let users: z.infer<typeof usersResponseSchema>;
  try {
    users = usersResponseSchema.parse(await apiFetch<unknown>("/users"));
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect("/login"); // token hết hạn hoặc đã bị thu hồi
    }
    if (error instanceof ApiError && error.status === 403) {
      return (
        <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
          <h1>Không có quyền</h1>
          <p>Trang này chỉ dành cho tài khoản ADMIN.</p>
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
        <h1>Users</h1>
        <form action={logoutAction}>
          <button type="submit">Đăng xuất</button>
        </form>
      </div>

      <UserForm />

      <ul>
        {users.map((user) => (
          <li key={user.id}>
            {user.email} {user.name ? `— ${user.name}` : ""}
          </li>
        ))}
      </ul>
      {users.length === 0 && <p>No users yet.</p>}
    </main>
  );
}
