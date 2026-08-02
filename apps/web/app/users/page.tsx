import { core } from "@repo/core";
import { UserForm } from "./user-form";

// Mutable, per-request data — never statically prerendered at build time.
export const dynamic = "force-dynamic";

// Server Component — fetches through the core service in-process,
// rendered on the server, streamed to the client. No client-side
// fetch(), no API round trip.
export default async function UsersPage() {
  const users = await core.user.list();

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
