import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Base Template",
  description: "Next.js + NestJS + Prisma monorepo base",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // `lang="vi"` chứ không phải "en": nó quyết định cách trình đọc màn hình phát
  // âm, cách trình duyệt ngắt dòng và gợi ý dịch trang.
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
