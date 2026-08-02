import { z } from "zod";
import { userSchema } from "@repo/contracts";
import { apiFetch } from "@/lib/api";
import { UserForm } from "./user-form";

// Mutable, per-request data — never statically prerendered at build time.
export const dynamic = "force-dynamic";

const usersResponseSchema = z.array(userSchema);

// Server Component — calls apps/api over HTTP, the same REST endpoint
// the mobile app hits. Still server-rendered/streamed; the network hop
// stays inside the datacenter, not the user's browser.
export default async function UsersPage() {
  const raw = await apiFetch<unknown>("/users");
  const users = usersResponseSchema.parse(raw);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>Users</h1>
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
