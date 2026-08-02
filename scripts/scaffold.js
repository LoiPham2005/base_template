#!/usr/bin/env node
/**
 * Automates the manual checklists in CONFIGURATIONS.md so switching
 * project configuration is one command instead of a hand-followed
 * checklist (error-prone — a forgotten step ships a subtly broken
 * project). See CONFIGURATIONS.md for what each config means and why.
 *
 * Usage (from repo root):
 *   node scripts/scaffold.js <api-only|solo>          dry run, no changes
 *   node scripts/scaffold.js <api-only|solo> --yes     actually apply
 *
 * Or via package.json:
 *   pnpm scaffold:api-only        pnpm scaffold:api-only:apply
 *   pnpm scaffold:solo            pnpm scaffold:solo:apply
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const mode = args[0];
const apply = args.includes("--yes");

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

if (
  !fs.existsSync(path.join(ROOT, "pnpm-workspace.yaml")) ||
  !fs.existsSync(path.join(ROOT, "turbo.json"))
) {
  fail(
    "Không tìm thấy pnpm-workspace.yaml/turbo.json — script này phải chạy từ gốc base_template.",
  );
}

if (!mode || !["api-only", "solo"].includes(mode)) {
  fail(
    [
      "Usage: node scripts/scaffold.js <api-only|solo> [--yes]",
      "",
      "  api-only   Xoá apps/web — chỉ giữ apps/api (CONFIGURATIONS.md, cấu hình B)",
      "  solo       Xoá apps/api, web gọi thẳng packages/core (CONFIGURATIONS.md, cấu hình C)",
      "",
      "Không có --yes: chỉ in ra sẽ làm gì (dry run), không đổi gì cả.",
    ].join("\n"),
  );
}

function isGitRepo() {
  try {
    execSync("git rev-parse --is-inside-work-tree", { cwd: ROOT, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function hasUncommittedChanges(relPath) {
  try {
    const out = execSync(`git status --porcelain -- "${relPath}"`, { cwd: ROOT }).toString().trim();
    return out.length > 0;
  } catch {
    return false;
  }
}

const actions = [];
const rm = (relPath) => actions.push({ type: "rm", path: relPath });
const write = (relPath, content) => actions.push({ type: "write", path: relPath, content });
const editJson = (relPath, mutate) => actions.push({ type: "editJson", path: relPath, mutate });
const warn = (msg) => actions.push({ type: "warn", msg });

if (mode === "api-only") {
  rm("apps/web");
  editJson("package.json", (pkg) => {
    delete pkg.scripts["dev:web"];
    return pkg;
  });
}

if (mode === "solo") {
  rm("apps/api");
  rm("apps/web/lib/api.ts");

  editJson("apps/web/package.json", (pkg) => {
    pkg.dependencies["@repo/core"] = "workspace:*";
    pkg.dependencies["@repo/db"] = "workspace:*";
    return pkg;
  });

  write(
    "apps/web/next.config.mjs",
    `/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lets Next.js trace and bundle workspace packages correctly in
  // standalone builds (needed once you deploy outside Vercel).
  transpilePackages: ["@repo/core", "@repo/contracts"],
  typedRoutes: true,
};

export default nextConfig;
`,
  );

  write(
    "apps/web/eslint.config.js",
    `const base = require("@repo/eslint-config");

module.exports = [...base, base.noDirectDbImport];
`,
  );

  write(
    "apps/web/.env.example",
    `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/base_template?schema=public"
`,
  );

  write(
    "apps/web/app/users/page.tsx",
    `import { core } from "@repo/core";
import { UserForm } from "./user-form";

// Mutable, per-request data — never statically prerendered at build time.
export const dynamic = "force-dynamic";

// Server Component — calls the core service directly, in-process.
// Valid only because this project has no other client (mobile/3rd-party)
// hitting the same data; see CONFIGURATIONS.md.
export default async function UsersPage() {
  const users = await core.user.list();

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>Users</h1>
      <UserForm />
      <ul>
        {users.map((user) => (
          <li key={user.id}>
            {user.email} {user.name ? \`— \${user.name}\` : ""}
          </li>
        ))}
      </ul>
      {users.length === 0 && <p>No users yet.</p>}
    </main>
  );
}
`,
  );

  write(
    "apps/web/app/users/actions.ts",
    `"use server";

import { revalidatePath } from "next/cache";
import { core, UserAlreadyExistsError } from "@repo/core";
import { createUserSchema } from "@repo/contracts";

export type CreateUserState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function createUserAction(
  _prevState: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  const parsed = createUserSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name") || undefined,
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    // Server Action calls the core service directly, in the same
    // process — no HTTP round-trip, no separate apps/api needed.
    await core.user.create(parsed.data);
  } catch (err) {
    if (err instanceof UserAlreadyExistsError) {
      return { error: err.message };
    }
    throw err;
  }

  revalidatePath("/users");
  return {};
}
`,
  );

  editJson("package.json", (pkg) => {
    delete pkg.scripts["dev:api"];
    return pkg;
  });

  if (fs.existsSync(path.join(ROOT, "apps/web/.env"))) {
    warn(
      "apps/web/.env đã tồn tại và có thể chứa giá trị thật — script KHÔNG tự sửa file này. " +
        "Tự tay: xoá API_URL, thêm DATABASE_URL.",
    );
  }
}

console.log(`\n${apply ? "Thực thi" : "[DRY RUN]"} cấu hình "${mode}":\n`);

if (apply && isGitRepo()) {
  const dirty = actions.filter((a) => a.type === "rm" && hasUncommittedChanges(a.path));
  if (dirty.length > 0) {
    fail(
      `Có thay đổi chưa commit trong: ${dirty.map((a) => a.path).join(", ")}\n` +
        "Commit hoặc stash trước khi chạy scaffold --yes (script này sẽ xoá thư mục đó vĩnh viễn).",
    );
  }
}

for (const action of actions) {
  if (action.type === "warn") {
    console.log(`  ⚠ ${action.msg}`);
    continue;
  }

  const full = path.join(ROOT, action.path);

  if (action.type === "rm") {
    const exists = fs.existsSync(full);
    console.log(`  ${exists ? "rm -rf" : "(bỏ qua, không tồn tại)"} ${action.path}`);
    if (apply && exists) fs.rmSync(full, { recursive: true, force: true });
  } else if (action.type === "write") {
    console.log(`  write   ${action.path}`);
    if (apply) {
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, action.content, "utf8");
    }
  } else if (action.type === "editJson") {
    console.log(`  edit    ${action.path}`);
    if (apply) {
      const json = JSON.parse(fs.readFileSync(full, "utf8"));
      const next = action.mutate(json);
      fs.writeFileSync(full, JSON.stringify(next, null, 2) + "\n", "utf8");
    }
  }
}

if (!apply) {
  console.log(`\nChạy lại kèm --yes để thực thi thật:\n  node scripts/scaffold.js ${mode} --yes\n`);
} else {
  console.log(
    `\nXong. Tiếp theo:\n  pnpm install\n` +
      (mode === "solo"
        ? `  cp packages/db/.env.example apps/web/.env   # rồi sửa DATABASE_URL\n  pnpm db:migrate\n  pnpm dev:web\n`
        : `  cp packages/db/.env.example packages/db/.env\n  cp apps/api/.env.example apps/api/.env\n  pnpm db:migrate\n  pnpm dev:api\n`),
  );
}
