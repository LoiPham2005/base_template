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
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  prettier,
];

/**
 * Apply in apps/* (web, api) — never in packages/core.
 * Keeps Prisma access confined to the core layer so business logic
 * doesn't fork between the Next.js and NestJS entry points.
 */
module.exports.noDirectDbImport = {
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["@repo/db", "@repo/db/*"],
            message:
              "Only @repo/core may import @repo/db directly. Call a core service instead.",
          },
        ],
      },
    ],
  },
};
