#!/usr/bin/env node
/**
 * Cắt bớt bộ khung cho đúng quy mô dự án — bằng một lệnh, thay vì một checklist
 * làm tay (làm tay thì sớm muộn cũng sót một bước, và bước sót đó ship lên
 * production).
 *
 * Cách dùng (chạy từ gốc repo):
 *   node scripts/scaffold.js <api-only|no-worker>          chạy thử, không đổi gì
 *   node scripts/scaffold.js <api-only|no-worker> --yes    thực thi thật
 *
 * Hoặc qua package.json:
 *   pnpm scaffold:api-only        pnpm scaffold:api-only:apply
 *   pnpm scaffold:no-worker       pnpm scaffold:no-worker:apply
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const mode = args[0];
const apply = args.includes("--yes");

const MODES = {
  "api-only": "Xoá apps/web — dự án chỉ có API cho mobile/bên thứ ba",
  "no-worker": "Xoá apps/worker và đặt QUEUE_ENABLED=0 — job chạy thẳng trong request",
};

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

/*
 * Cấu hình "solo" (Next.js gọi thẳng packages/core, không có apps/api) đã bị
 * gỡ bỏ CÓ CHỦ ĐÍCH.
 *
 * Toàn bộ lớp xác thực và phân quyền giờ nằm ở apps/api: guard JWT, guard
 * quyền, rate limit theo Redis, ánh xạ lỗi nghiệp vụ sang mã HTTP. Bỏ apps/api
 * đi không phải là xoá một thư mục — đó là viết lại tất cả những thứ đó bằng
 * middleware và Server Action của Next.js.
 *
 * Nếu dự án của bạn thật sự chỉ cần một app Next.js duy nhất, hãy bắt đầu từ
 * repo `nextjs_base` — nó được dựng sẵn theo đúng hình dạng đó.
 */
if (mode === "solo") {
  fail(
    [
      'Cấu hình "solo" không còn được hỗ trợ ở base_template.',
      "",
      "Lý do: xác thực, phân quyền, rate limit và ánh xạ lỗi đều nằm ở apps/api.",
      "Bỏ apps/api đi là phải viết lại toàn bộ những thứ đó trong Next.js — không",
      "phải một checklist, mà là một lần dựng lại.",
      "",
      "Chỉ cần MỘT app Next.js? Bắt đầu từ repo `nextjs_base` thay vì cắt repo này.",
    ].join("\n"),
  );
}

if (!mode || !(mode in MODES)) {
  fail(
    [
      "Usage: node scripts/scaffold.js <chế-độ> [--yes]",
      "",
      ...Object.entries(MODES).map(([key, description]) => `  ${key.padEnd(11)} ${description}`),
      "",
      "Không có --yes: chỉ in ra sẽ làm gì (chạy thử), không đổi gì cả.",
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
    return (
      execSync(`git status --porcelain -- "${relPath}"`, { cwd: ROOT }).toString().trim().length > 0
    );
  } catch {
    return false;
  }
}

const actions = [];
const rm = (relPath) => actions.push({ type: "rm", path: relPath });
const editJson = (relPath, mutate) => actions.push({ type: "editJson", path: relPath, mutate });
const warn = (msg) => actions.push({ type: "warn", msg });

if (mode === "api-only") {
  rm("apps/web");
  editJson("package.json", (pkg) => {
    delete pkg.scripts["dev:web"];
    return pkg;
  });
  warn("Gỡ luôn service `web` khỏi docker-compose.yml và khối reverse proxy trong Caddyfile.");
  warn(
    "Link trong email vẫn trỏ tới APP_URL (trang web). Không còn web thì hãy đổi " +
      "WEB_ROUTES trong packages/core/src/infra/emails.ts sang deep link của app mobile.",
  );
}

if (mode === "no-worker") {
  rm("apps/worker");
  editJson("package.json", (pkg) => {
    delete pkg.scripts["dev:worker"];
    return pkg;
  });
  warn("Gỡ service `worker` khỏi docker-compose.yml.");
  warn(
    "ĐẶT QUEUE_ENABLED=0 trong .env. Bỏ qua bước này là app vẫn đẩy job vào Redis " +
      "trong khi không còn worker nào chạy — job nằm đó mãi, email không bao giờ được " +
      "gửi, và không một dòng log nào báo.",
  );
  warn(
    "Đổi lại: mất THỬ LẠI TỰ ĐỘNG. Một lần SMTP nghẽn sẽ bung thẳng ra request thay " +
      "vì được chạy lại sau vài giây.",
  );
}

console.log(`\n${apply ? "Thực thi" : "[CHẠY THỬ]"} cấu hình "${mode}":\n`);

if (apply && isGitRepo()) {
  const dirty = actions.filter((a) => a.type === "rm" && hasUncommittedChanges(a.path));
  if (dirty.length > 0) {
    fail(
      `Có thay đổi chưa commit trong: ${dirty.map((a) => a.path).join(", ")}\n` +
        "Commit hoặc stash trước khi chạy --yes (script này xoá thư mục đó vĩnh viễn).",
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
  } else if (action.type === "editJson") {
    console.log(`  edit    ${action.path}`);
    if (apply) {
      const json = JSON.parse(fs.readFileSync(full, "utf8"));
      fs.writeFileSync(full, `${JSON.stringify(action.mutate(json), null, 2)}\n`, "utf8");
    }
  }
}

if (!apply) {
  console.log(`\nChạy lại kèm --yes để thực thi thật:\n  node scripts/scaffold.js ${mode} --yes\n`);
} else {
  console.log("\nXong. Tiếp theo:\n  pnpm install\n  pnpm build\n");
}
