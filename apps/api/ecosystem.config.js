// PM2 config for deploying apps/api on a raw VPS (no Docker/Railway).
// Usage on the server, after `pnpm build`:
//   pm2 start ecosystem.config.js
//   pm2 reload ecosystem.config.js   (zero-downtime restart after a new build)
module.exports = {
  apps: [
    {
      name: "api",
      cwd: __dirname,
      script: "dist/main.js",
      // fork + instances:1 keeps exactly one Prisma connection pool.
      // Raising `instances` (cluster mode) multiplies DB connections by
      // that count — only do it if packages/db's pool size is sized
      // for it (see DATABASE_URL connection_limit).
      exec_mode: "fork",
      instances: 1,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
