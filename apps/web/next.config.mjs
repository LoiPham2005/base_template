/**
 * Header bảo mật tĩnh, áp cho mọi response của apps/web.
 *
 * Chỉ khai báo ở đây, KHÔNG lặp lại trong Caddyfile: hai nguồn sự thật cho
 * cùng một header thì sớm muộn cũng lệch nhau, và lúc đó rất khó biết cái nào
 * đang thắng. Caddy chỉ làm nhiệm vụ proxy.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lets Next.js trace and bundle workspace packages correctly in
  // standalone builds (needed once you deploy outside Vercel).
  transpilePackages: ["@repo/contracts"],
  typedRoutes: true,

  // Comment ngay phía trên nói về "standalone builds", nhưng tuỳ chọn này
  // trước đây KHÔNG hề được bật. Hệ quả: Dockerfile phải chép nguyên cả
  // monorepo (`COPY --from=installer /app ./`) vì `next start` cần đủ
  // node_modules của toàn workspace. Bật lên thì Next tự trace đúng những file
  // cần thiết và image runtime chỉ còn một phần nhỏ.
  output: "standalone",

  // Monorepo: chỉ rõ gốc workspace để Next trace file cho đúng. Không có nó,
  // Next đoán theo lockfile gần nhất và có thể bỏ sót package.
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,

  reactStrictMode: true,

  // Không quảng cáo framework đang chạy phía sau.
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
