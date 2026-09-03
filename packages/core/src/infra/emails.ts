import { appUrl, env } from "../config/env";
import { enqueue } from "./queue";

/**
 * Nội dung các email hệ thống.
 *
 * Mọi email đi qua HÀNG ĐỢI, không gửi thẳng: SMTP có thể mất vài giây, và
 * người dùng bấm "quên mật khẩu" không nên ngồi chờ chừng ấy chỉ để nhận về
 * một trang xác nhận. Quan trọng hơn — hàng đợi có THỬ LẠI: nhà cung cấp thư
 * nghẽn một lúc thì job tự chạy lại, thay vì lá thư biến mất vĩnh viễn.
 *
 * Tách khỏi service để chữ nghĩa sửa được mà không đụng vào logic, và để service
 * không phải biết gì về đường dẫn hay cách dựng link.
 */

/**
 * Đường dẫn TRÊN WEB (không phải trên API) mà người dùng sẽ mở từ email.
 *
 * Đổi tên route ở `apps/web` thì sửa ở đây — nếu không, link trong email trỏ
 * vào trang 404, và lỗi đó chỉ lộ ra khi có người thật bấm vào.
 */
const WEB_ROUTES = {
  verifyEmail: "/verify-email",
  resetPassword: "/reset-password",
} as const;

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const link = appUrl(`${WEB_ROUTES.verifyEmail}?token=${encodeURIComponent(token)}`);

  await enqueue("email:send", {
    to,
    subject: "Xác thực địa chỉ email của bạn",
    text: [
      "Chào bạn,",
      "",
      "Nhấn vào liên kết dưới đây để xác thực địa chỉ email này:",
      link,
      "",
      `Liên kết có hiệu lực trong ${env.EMAIL_VERIFICATION_TTL_HOURS} giờ.`,
      "",
      "Nếu bạn không tạo tài khoản nào, hãy bỏ qua email này.",
    ].join("\n"),
  });
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const link = appUrl(`${WEB_ROUTES.resetPassword}?token=${encodeURIComponent(token)}`);

  await enqueue("email:send", {
    to,
    subject: "Đặt lại mật khẩu",
    text: [
      "Chào bạn,",
      "",
      "Có yêu cầu đặt lại mật khẩu cho tài khoản này. Nhấn vào liên kết dưới đây:",
      link,
      "",
      `Liên kết có hiệu lực trong ${env.PASSWORD_RESET_TTL_MINUTES} phút và chỉ dùng được một lần.`,
      "",
      // Câu này quan trọng hơn vẻ ngoài của nó: người nhận nhầm cần biết họ
      // không phải làm gì cả, và mật khẩu hiện tại vẫn còn nguyên hiệu lực.
      "Nếu bạn không yêu cầu, hãy bỏ qua email này — mật khẩu của bạn không thay đổi.",
    ].join("\n"),
  });
}

/**
 * Báo cho người dùng biết mật khẩu vừa bị đổi.
 *
 * Không phải thư xã giao: nếu tài khoản đã bị chiếm, đây là tín hiệu duy nhất
 * mà chủ tài khoản thật nhận được. Gửi SAU KHI đổi thành công, tới địa chỉ CŨ.
 */
export async function sendPasswordChangedEmail(to: string): Promise<void> {
  await enqueue("email:send", {
    to,
    subject: "Mật khẩu của bạn vừa được thay đổi",
    text: [
      "Chào bạn,",
      "",
      "Mật khẩu tài khoản của bạn vừa được thay đổi, và mọi thiết bị đang đăng nhập đã bị đăng xuất.",
      "",
      "Nếu KHÔNG phải bạn thực hiện, hãy đặt lại mật khẩu ngay và liên hệ quản trị viên.",
    ].join("\n"),
  });
}
