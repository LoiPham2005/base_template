/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lets Next.js trace and bundle workspace packages correctly in
  // standalone builds (needed once you deploy outside Vercel).
  transpilePackages: ["@repo/contracts"],
  typedRoutes: true,
};

export default nextConfig;
