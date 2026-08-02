import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Workspace packages (@repo/db, @repo/contracts) resolve to raw .ts
    // source through the pnpm symlink, not compiled output — Vitest must
    // transform them like local source instead of treating them as
    // pre-built node_modules.
    server: {
      deps: {
        inline: [/^@repo\//],
      },
    },
  },
});
