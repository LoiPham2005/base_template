// PM2 config cho apps/worker trên VPS trần (không Docker).
//   pm2 start ecosystem.config.js
//   pm2 reload ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "worker",
      cwd: __dirname,
      script: "dist/main.js",

      /*
       * `fork` + `instances: 1`.
       *
       * Chạy nhiều worker LÀ an toàn về mặt job — BullMQ khoá job qua Redis nên
       * một job chỉ được giao cho đúng một worker. Nhưng mỗi instance mở một
       * pool kết nối Prisma riêng, và `WORKER_CONCURRENCY` đã là mức song song
       * TRONG một tiến trình.
       *
       * Cần nhiều hơn thì tăng `WORKER_CONCURRENCY` trước; chỉ tăng `instances`
       * khi CPU của một tiến trình đã bão hoà, và nhớ nới `connection_limit`
       * trong DATABASE_URL cho tương ứng.
       */
      exec_mode: "fork",
      instances: 1,
      max_memory_restart: "512M",

      /*
       * Job đang chạy dở cần thời gian hoàn tất khi nhận SIGTERM. Mặc định PM2
       * chỉ đợi 1.6 giây rồi SIGKILL — quá ngắn cho một job gửi mail hoặc xuất
       * báo cáo, và cắt ngang giữa chừng là để lại dữ liệu dở dang.
       */
      kill_timeout: 60000,

      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
