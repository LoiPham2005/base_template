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

/**
 * API không phản hồi: sập, đang deploy, hoặc mạng giữa web và api đứt.
 *
 * Tách khỏi `ApiError` vì hai thứ khác nhau về bản chất và về cách xử lý:
 * `ApiError` nghĩa là API ĐÃ trả lời — chỉ là trả lời "không" (401, 422…).
 * Lỗi này nghĩa là không có ai trả lời cả.
 *
 * Người dùng cần thấy hai thông điệp khác nhau ("sai mật khẩu" vs "hệ thống
 * đang bảo trì"), và bên vận hành cần phân biệt để biết cảnh báo cái gì.
 */
export class ApiUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("Hệ thống đang tạm thời không phản hồi. Vui lòng thử lại sau ít phút.");
    this.name = "ApiUnavailableError";
    this.cause = cause;
  }
}

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
  /** Hạn chờ (ms). Xem `DEFAULT_TIMEOUT_MS`. */
  timeoutMs?: number;
};

/**
 * Hạn chờ mặc định cho mỗi lần gọi API.
 *
 * ---
 * VÌ SAO PHẢI CÓ, VÀ VÌ SAO NÓ QUAN TRỌNG HƠN VIỆC BẮT LỖI
 *
 * `fetch` của Node KHÔNG có timeout mặc định. Nghĩa là khi API **treo** (còn
 * sống nhưng không trả lời — hết connection pool, deadlock database, GC dài),
 * request của web nằm chờ vô hạn.
 *
 * Đó là kịch bản tệ HƠN việc API chết hẳn: API chết thì kết nối bị từ chối
 * ngay, còn API treo thì mọi request web cứ tích tụ, chiếm hết luồng của
 * Next.js, và **web sập theo dù bản thân nó không có lỗi gì**.
 *
 * 10 giây là mức thoáng cho một nhịp gọi trong nội bộ datacenter. Endpoint nào
 * thật sự chậm (xuất báo cáo) thì tự truyền `timeoutMs` lớn hơn.
 */
const DEFAULT_TIMEOUT_MS = 10_000;

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { token, timeoutMs = DEFAULT_TIMEOUT_MS, ...init } = options;
  const accessToken = token === undefined ? await getAccessToken() : token;

  let response: Response;

  try {
    response = await fetch(`${API_URL}${API_PREFIX}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...init.headers,
      },
      // Dữ liệu người dùng KHÔNG được cache dùng chung giữa các phiên.
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    /*
     * Tới đây nghĩa là KHÔNG CÓ AI TRẢ LỜI — kết nối bị từ chối, DNS hỏng, hoặc
     * quá hạn chờ. Đây KHÔNG phải lỗi 5xx (5xx thì API có trả lời, và rơi vào
     * nhánh `!response.ok` bên dưới).
     *
     * Bọc lại thành một lớp riêng để trang gọi nó phân biệt được "API nói
     * không" với "API không nói gì" — hai thứ dẫn tới hai màn hình khác nhau.
     */
    throw new ApiUnavailableError(error);
  }

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
