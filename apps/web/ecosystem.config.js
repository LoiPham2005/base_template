// PM2 config for deploying apps/web on a raw VPS (no Docker/Railway/Vercel).
// Pair with the root Caddyfile as the public HTTPS/reverse-proxy layer.
// Usage on the server, after `pnpm build`:
//   pm2 start ecosystem.config.js
//   pm2 reload ecosystem.config.js   (zero-downtime restart after a new build)
module.exports = {
  apps: [
    {
      name: "web",
      cwd: __dirname,
      script: "node_modules/.bin/next",
      args: "start -p 3000",
      exec_mode: "fork",
      instances: 1,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
