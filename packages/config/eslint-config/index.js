const tseslint = require("@typescript-eslint/eslint-plugin");
const tsParser = require("@typescript-eslint/parser");
const prettier = require("eslint-config-prettier");

/** Base flat config shared by every app/package. Extend, don't fork. */
module.exports = [
  {
    ignores: ["**/dist/**", "**/.next/**", "**/node_modules/**", "**/.turbo/**"],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      // Prefix `_` = cố ý không dùng. Cần cả bốn tuỳ chọn, không chỉ args:
      // `const { password: _password, ...rest } = user` là cách chuẩn để loại
      // một field ra khỏi object, và nếu thiếu ignoreRestSiblings/varsIgnorePattern
      // thì mọi lần làm vậy đều bị cảnh báo.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",

      /*
       * `console.*` bị cấm ở mã ứng dụng.
       *
       * Không phải chuyện thẩm mỹ: `console.log` ghi ra chuỗi tự do, còn hệ
       * thống thu log (Loki/Datadog/CloudWatch) cần JSON một dòng để lọc và
       * cảnh báo. Một dòng `console.log` lọt vào production là một dòng không
       * ai tìm lại được, và tệ hơn — nó không đi qua bộ che dữ liệu nhạy cảm
       * của `logger`, nên rất dễ thành một lần rò mật khẩu vào log.
       *
       * Dùng `logger` từ `@repo/core`. Hai ngoại lệ hợp lệ đã được đánh dấu
       * tường minh bằng `eslint-disable`: chính bản thân `logger`, và
       * `observability` (không được gọi ngược lại logger, sẽ thành vòng lặp).
       * Script chạy tay (seed, CLI) thì tắt rule này ở cấu hình riêng.
       */
      "no-console": "error",
    },
  },
  prettier,
];

/**
 * Apply in apps/api only. Keeps Prisma access confined to the core
 * layer so business logic doesn't fork between modules.
 */
module.exports.noDirectDbImport = {
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["@repo/db", "@repo/db/*"],
            message: "Only @repo/core may import @repo/db directly. Call a core service instead.",
          },
        ],
      },
    ],
  },
};

/**
 * Apply in apps/web only. Web is a thin BFF: it talks to apps/api over
 * HTTP (same as the mobile app), never imports business logic or the
 * DB in-process. This keeps all three clients (web, mobile, 3rd party)
 * behaviorally identical — matches the pattern used across every real
 * project in this workspace (deploybox, sports_booking, dat_san_247, …).
 */
module.exports.webMustUseApi = {
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["@repo/core", "@repo/core/*", "@repo/db", "@repo/db/*"],
            message:
              "apps/web must not import business logic or the DB directly — call apps/api over HTTP instead, the same way the mobile app does.",
          },
        ],
      },
    ],
  },
};
