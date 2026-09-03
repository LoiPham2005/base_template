import { createSign } from "node:crypto";
import { env } from "../../config/env";
import { ProviderNotConfiguredError } from "../../common/errors";

/**
 * Apple không cấp client secret tĩnh: secret là một JWT do CHÍNH BẠN ký bằng
 * private key `.p8` tải từ Apple Developer, thuật toán ES256, hạn tối đa 6
 * tháng.
 *
 * Vì vậy nó phải được sinh lúc chạy chứ không nằm trong `.env`. Cache lại và
 * chỉ ký mới khi sắp hết hạn — ký ES256 không đắt, nhưng làm việc đó ở mỗi lần
 * đăng nhập là lãng phí không có lý do.
 */

/** Ký hạn 1 giờ. Ngắn hơn hẳn mức Apple cho phép — không có lý do gì để dài. */
const TTL_SECONDS = 3600;
/** Ký lại khi còn dưới 5 phút, tránh dùng phải token vừa hết hạn giữa chừng. */
const REFRESH_BEFORE_SECONDS = 300;

let cached: { secret: string; expiresAt: number } | null = null;

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export function getAppleClientSecret(): string {
  const { APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY } = env;

  if (!APPLE_CLIENT_ID || !APPLE_TEAM_ID || !APPLE_KEY_ID || !APPLE_PRIVATE_KEY) {
    throw new ProviderNotConfiguredError("apple");
  }

  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.expiresAt - now > REFRESH_BEFORE_SECONDS) return cached.secret;

  const header = base64url(JSON.stringify({ alg: "ES256", kid: APPLE_KEY_ID, typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      iss: APPLE_TEAM_ID,
      iat: now,
      exp: now + TTL_SECONDS,
      aud: "https://appleid.apple.com",
      sub: APPLE_CLIENT_ID,
    }),
  );

  // Biến `\n` trong biến môi trường thành xuống dòng thật: file .env và giao
  // diện của các nền tảng deploy đều không giữ được ký tự xuống dòng.
  const privateKey = APPLE_PRIVATE_KEY.replace(/\\n/g, "\n");

  const signer = createSign("SHA256");
  signer.update(`${header}.${payload}`);
  // `dsaEncoding: "ieee-p1363"` là bắt buộc: mặc định của Node là DER, còn JWS
  // (RFC 7518) yêu cầu dạng r||s thô. Sai chỗ này thì Apple trả
  // `invalid_client` mà không nói vì sao.
  const signature = signer.sign({ key: privateKey, dsaEncoding: "ieee-p1363" });

  const secret = `${header}.${payload}.${base64url(signature)}`;
  cached = { secret, expiresAt: now + TTL_SECONDS };

  return secret;
}
