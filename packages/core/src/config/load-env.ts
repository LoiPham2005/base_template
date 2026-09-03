import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { config as loadDotenv } from "dotenv";

/**
 * Nạp `.env` cho MỌI tiến trình trong monorepo.
 *
 * ---
 * VÌ SAO KHÔNG DÙNG THẲNG `import "dotenv/config"`
 *
 * `dotenv/config` đọc `.env` ở `process.cwd()`. Trong monorepo, `cwd` là thư
 * mục của app đang chạy — nên `pnpm dev:api` đọc `apps/api/.env`, còn
 * `pnpm dev:worker` đọc `apps/worker/.env`. Kết quả là ba bản `.env` phải giữ
 * đồng bộ bằng tay, và chiều lệch nguy hiểm nhất diễn ra trong im lặng: api và
 * worker trỏ vào hai database khác nhau, hoặc worker dùng `DATABASE_URL` cũ sau
 * khi ai đó đổi ở api.
 *
 * Ở đây: đọc `.env` của app trước (nếu có), rồi đọc `.env` ở GỐC workspace.
 * `dotenv` KHÔNG ghi đè biến đã tồn tại, nên file nạp trước thắng — tức là
 * `.env` riêng của app đè lên `.env` chung, đúng thứ tự người ta mong đợi.
 *
 * Biến đã có sẵn trong môi trường (CI, Docker, systemd) luôn thắng cả hai —
 * đây là hành vi đúng: cấu hình thật không nằm trong file nào cả.
 */

/** Đi ngược lên tìm thư mục chứa `pnpm-workspace.yaml`. */
function findWorkspaceRoot(from: string): string | null {
  let current = resolve(from);

  // Dừng ở thư mục gốc của ổ đĩa: `dirname("/")` trả về chính `"/"`.
  for (;;) {
    if (existsSync(join(current, "pnpm-workspace.yaml"))) return current;

    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

let loaded = false;

export function loadEnvFiles(): void {
  // Chạy nhiều lần là vô hại nhưng thừa: nhiều module cùng gọi hàm này lúc
  // khởi động.
  if (loaded) return;
  loaded = true;

  loadDotenv({ path: resolve(process.cwd(), ".env"), quiet: true });

  const root = findWorkspaceRoot(process.cwd());
  if (root) loadDotenv({ path: join(root, ".env"), quiet: true });
}
