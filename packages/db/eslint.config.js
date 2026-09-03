const base = require("@repo/eslint-config");

module.exports = [
  ...base,
  {
    /*
     * Script seed được chạy BẰNG TAY từ terminal (`pnpm db:seed`), và output
     * của nó là dành cho con người đang nhìn màn hình — không phải cho hệ thống
     * thu log. `logger` JSON một dòng ở đây sẽ khó đọc hơn hẳn, nên `console`
     * mới là lựa chọn đúng.
     */
    files: ["prisma/**/*.ts"],
    rules: { "no-console": "off" },
  },
];
