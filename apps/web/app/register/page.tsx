import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccessToken } from "@/lib/session";
import { linkClass } from "@/lib/ui";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Đăng ký" };
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  if (await getAccessToken()) redirect("/users");

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-12">
      <h1 className="mb-6 text-2xl font-semibold">Đăng ký</h1>

      <RegisterForm />

      <p className="mt-6 text-center text-sm text-slate-500">
        Đã có tài khoản?{" "}
        <Link href="/login" className={linkClass}>
          Đăng nhập
        </Link>
      </p>
    </main>
  );
}
