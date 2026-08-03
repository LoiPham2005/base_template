import "server-only";
import { getAccessToken } from "./session";

const API_URL = process.env.API_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Server-only fetch wrapper to apps/api. Every data read/write from the
 * web app goes through here — the same REST endpoints the mobile app
 * calls — so web, mobile, and any third party stay behaviorally
 * identical. Never call this from a Client Component; it has no
 * business being in the browser bundle.
 *
 * Access token được đính tự động từ cookie phiên. Trước đây hàm này không gửi
 * gì cả, nên khi API siết quyền `/users` thì web nhận 401 — nay web trở thành
 * một client bình thường của API, dùng đúng cơ chế xác thực như app mobile.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
    // Dữ liệu người dùng không được cache dùng chung giữa các phiên.
    cache: "no-store",
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: { message?: string; code?: string };
      message?: string;
    } | null;

    // apps/api trả { success:false, error:{ code, message } } qua
    // AllExceptionsFilter; vẫn đỡ trường hợp body không đúng dạng.
    const message = body?.error?.message ?? body?.message ?? res.statusText;
    throw new ApiError(res.status, message, body?.error?.code);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}
