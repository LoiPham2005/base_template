import type { FastifyRequest } from "fastify";

export const REQUEST_ID_HEADER = "x-request-id";

/**
 * IP thật của client.
 *
 * Fastify được bật `trustProxy` trong `main.ts`, nên `request.ip` đã đọc
 * `X-Forwarded-For` do reverse proxy đặt. Vẫn giữ nhánh đọc header thủ công cho
 * trường hợp chạy sau một proxy không được tin (khi đó `trustProxy` tắt).
 *
 * ⚠️ Giá trị này do proxy đặt. Nếu proxy của bạn NỐI THÊM vào `X-Forwarded-For`
 * thay vì GHI ĐÈ, client tự khai man IP được — và rate limit theo IP trở nên vô
 * dụng. `Caddyfile` trong repo này ghi đè bằng `{remote_host}`.
 */
export function clientIp(request: FastifyRequest): string {
  if (request.ip) return request.ip;

  const forwarded = request.headers["x-forwarded-for"];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;

  return first?.split(",")[0]?.trim() ?? "unknown";
}

export function userAgent(request: FastifyRequest): string | null {
  const value = request.headers["user-agent"];
  // Cắt bớt: một client gửi User-Agent dài 10KB sẽ được lưu nguyên vào database
  // ở mỗi lần đăng nhập nếu không chặn.
  return typeof value === "string" ? value.slice(0, 512) : null;
}

/**
 * Mã định danh request, dùng để nối các dòng log rời rạc lại với nhau.
 *
 * Ưu tiên header có sẵn: reverse proxy (Caddy, nginx, Cloudflare) thường đã gắn
 * `X-Request-Id`, và tôn trọng giá trị đó thì log của ứng dụng nối được với log
 * của tầng mạng.
 *
 * ⚠️ Giá trị này do CLIENT gửi được, nên KHÔNG BAO GIỜ dùng nó vào việc bảo mật
 * hay làm khoá dữ liệu. Nó chỉ để đọc log.
 */
export function getRequestId(request: FastifyRequest): string {
  const incoming = request.headers[REQUEST_ID_HEADER];
  const value = Array.isArray(incoming) ? incoming[0] : incoming;

  if (!value) return crypto.randomUUID();

  // Chỉ giữ ký tự an toàn cho log: chuỗi lạ do client gửi có thể chứa xuống
  // dòng, và một dòng log JSON bị chèn thêm xuống dòng là một dòng log giả mạo
  // được.
  const cleaned = value.replace(/[^\w.:-]/g, "").slice(0, 128);
  return cleaned || crypto.randomUUID();
}
