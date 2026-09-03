const base = require("@repo/eslint-config");

/**
 * Worker được phép import `@repo/db` (khác apps/api) — nhưng CHỈ để
 * `$disconnect()` lúc tắt. Mọi truy vấn vẫn phải đi qua service của
 * `@repo/core`; xem ghi chú trong `src/main.ts`.
 */
module.exports = [...base];
