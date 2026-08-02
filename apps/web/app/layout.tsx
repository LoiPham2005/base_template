import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Base Template",
  description: "Next.js + NestJS + Prisma monorepo base",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
