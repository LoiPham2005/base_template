import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccessToken } from "@/lib/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Đăng nhập" };
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // Đã đăng nhập thì không cần vào đây nữa.
  if (await getAccessToken()) redirect("/users");

  const { next } = await searchParams;

  return (
    <main style={{ padding: 24, maxWidth: 380, fontFamily: "system-ui, sans-serif" }}>
      <h1>Đăng nhập</h1>
      <LoginForm next={next} />
    </main>
  );
}
