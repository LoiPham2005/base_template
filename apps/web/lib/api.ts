import "server-only";
import { getAccessToken } from "./session";

/**
 * Cửa DUY NHẤT để web nói chuyện với `apps/api`.
 *
 * Mọi lần đọc/ghi dữ liệu từ web đều đi qua đây — cùng những endpoint REST mà
 * app mobile gọi. Nhờ vậy web, mobile và bên thứ ba hành xử giống hệt nhau, và
 * không có "đường tắt" nào bỏ qua một luật nghiệp vụ.
 *
 * ⚠️ `server-only`: KHÔNG BAO GIỜ gọi từ Client Component. Access token nằm
 * trong cookie `httpOnly` và không có lý do gì để có mặt trong bundle trình
 * duyệt.
 */

const API_URL = process.env.API_URL ?? "http://localhost:3001";

/**
 * Tiền tố version, khai báo MỘT LẦN.
 *
 * Lên v2 thì sửa đúng dòng này — thay vì đi tìm `"/api/v1"` rải rác trong hàng
 * chục Server Action, nơi sót một chỗ là chỗ đó gọi vào version đã ngừng phục
 * vụ và hỏng lúc chạy chứ không phải lúc biên dịch.
 */
export const API_PREFIX = "/api/v1";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    /** Lỗi theo từng trường, để hiển thị ngay dưới ô nhập tương ứng. */
    readonly fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type ApiEnvelope<T> =
  { data: T } | { error: { code: string; message: string; fields?: Record<string, string[]> } };

export type ApiFetchOptions = RequestInit & {
  /** Ghi đè token (dùng trong `middleware.ts`, nơi chưa có cookie mới). */
  token?: string | null;
};

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { token, ...init } = options;
  const accessToken = token === undefined ? await getAccessToken() : token;

  const response = await fetch(`${API_URL}${API_PREFIX}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
    // Dữ liệu người dùng KHÔNG được cache dùng chung giữa các phiên.
    cache: "no-store",
  });

  if (response.status === 204) return undefined as T;

  const body = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (!response.ok) {
    const error = body && "error" in body ? body.error : undefined;
    throw new ApiError(
      response.status,
      error?.message ?? response.statusText,
      error?.code,
      error?.fields,
    );
  }

  // API luôn bọc response thành công trong `{ data }` (xem
  // `TransformInterceptor`). Nhánh dự phòng để một endpoint quên bọc không làm
  // sập cả trang.
  return body && "data" in body ? body.data : (body as T);
}
