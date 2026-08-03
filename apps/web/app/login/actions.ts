"use server";

import { redirect } from "next/navigation";
import { loginSchema } from "@repo/contracts";
import { apiFetch, ApiError } from "@/lib/api";
import { clearAccessToken, setAccessToken } from "@/lib/session";

export type LoginState = {
  error?: string;
  fieldErrors?: Partial<Record<"email" | "password", string[]>>;
};

type LoginResponse = {
  data: { accessToken: string; user: { id: string; email: string; role: string } };
};

/** Khớp với JWT_EXPIRES_IN mặc định của API (7d). */
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  let response: LoginResponse;
  try {
    response = await apiFetch<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(parsed.data),
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      // Dùng nguyên thông điệp của API: nó cố tình giống nhau cho mọi nhánh
      // thất bại, không tiết lộ email nào đã đăng ký.
      return { error: error.message };
    }
    if (error instanceof ApiError && error.status === 429) {
      return { error: "Bạn đã thử quá nhiều lần. Vui lòng đợi một lát." };
    }
    return { error: "Không thể đăng nhập lúc này. Vui lòng thử lại." };
  }

  await setAccessToken(response.data.accessToken, SESSION_MAX_AGE_SECONDS);

  // redirect() hoạt động bằng cách ném exception — phải nằm ngoài try/catch.
  redirect("/users");
}

export async function logoutAction(): Promise<void> {
  await clearAccessToken();
  redirect("/login");
}
