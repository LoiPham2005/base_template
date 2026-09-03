import type { OAuthProviderId } from "@repo/contracts";
import { env } from "../../config/env";
import { ProviderExchangeError, ProviderNotConfiguredError } from "../../common/errors";
import { getAppleClientSecret } from "./apple-client-secret";
import { PROVIDER_CONFIG, callbackUrl, isProviderConfigured } from "./config";

/** Hồ sơ đã chuẩn hoá — phần còn lại của hệ thống không cần biết Google khác GitHub ở đâu. */
export type OAuthProfile = {
  provider: OAuthProviderId;
  providerAccountId: string;
  /** `null` nếu provider không trả email, hoặc email chưa được xác thực. */
  email: string | null;
  fullName: string | null;
};

export function buildAuthorizationUrl(
  provider: OAuthProviderId,
  params: { state: string; codeChallenge?: string },
): URL {
  if (!isProviderConfigured(provider)) throw new ProviderNotConfiguredError(provider);

  const config = PROVIDER_CONFIG[provider];
  const url = new URL(config.authorizationEndpoint);

  url.searchParams.set("client_id", config.clientId!);
  url.searchParams.set("redirect_uri", callbackUrl(provider));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scope);
  url.searchParams.set("state", params.state);

  if (config.responseMode) url.searchParams.set("response_mode", config.responseMode);

  if (config.usePkce && params.codeChallenge) {
    url.searchParams.set("code_challenge", params.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }

  return url;
}

function resolveClientSecret(provider: OAuthProviderId): string {
  if (provider === "apple") return getAppleClientSecret();

  const secret = {
    google: env.GOOGLE_CLIENT_SECRET,
    github: env.GITHUB_CLIENT_SECRET,
    facebook: env.FACEBOOK_CLIENT_SECRET,
  }[provider];

  if (!secret) throw new ProviderNotConfiguredError(provider);
  return secret;
}

export type ExchangedTokens = {
  accessToken: string;
  /** Chỉ Google/Apple trả — chứa danh tính đã ký, lấy hồ sơ mà không cần gọi thêm API. */
  idToken?: string;
};

/**
 * Đổi authorization code lấy token.
 *
 * Không để lỗi mạng/HTTP bung ra nguyên dạng — bọc thành `ProviderExchangeError`
 * để nơi gọi chỉ cần một nhánh xử lý, không phải phân biệt "provider từ chối
 * code" với "provider sập" với "JSON hỏng".
 */
export async function exchangeCodeForToken(
  provider: OAuthProviderId,
  code: string,
  codeVerifier?: string,
): Promise<ExchangedTokens> {
  if (!isProviderConfigured(provider)) throw new ProviderNotConfiguredError(provider);

  const config = PROVIDER_CONFIG[provider];

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: callbackUrl(provider),
    client_id: config.clientId!,
    client_secret: resolveClientSecret(provider),
  });

  if (config.usePkce && codeVerifier) body.set("code_verifier", codeVerifier);

  try {
    const response = await fetch(config.tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        // GitHub mặc định trả form-urlencoded nếu không xin JSON.
        Accept: "application/json",
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`Token endpoint trả về ${response.status}: ${await response.text()}`);
    }

    const json = (await response.json()) as { access_token?: string; id_token?: string };
    if (!json.access_token) throw new Error("Thiếu access_token trong phản hồi");

    return { accessToken: json.access_token, idToken: json.id_token };
  } catch (error) {
    throw new ProviderExchangeError(provider, error);
  }
}

type IdTokenClaims = {
  sub: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
};

/**
 * Giải mã `id_token` KHÔNG kiểm chữ ký.
 *
 * An toàn ở đây vì `id_token` tới TRỰC TIẾP từ token endpoint của provider qua
 * kênh HTTPS đã xác thực bằng `client_secret` (kênh "back-channel") — khác hẳn
 * trường hợp id_token đi qua trình duyệt, nơi bắt buộc phải verify chữ ký vì
 * bất kỳ ai cũng chèn được token giả.
 */
function decodeIdToken(idToken: string): IdTokenClaims {
  const payload = idToken.split(".")[1];
  if (!payload) throw new Error("id_token không đúng định dạng JWT");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as IdTokenClaims;
}

/** Google trả `true`, một số provider trả chuỗi `"true"` — chấp nhận cả hai. */
function isVerified(value: boolean | string | undefined): boolean {
  return value === true || value === "true";
}

function fromIdToken(provider: "google" | "apple", idToken: string): OAuthProfile {
  const claims = decodeIdToken(idToken);

  return {
    provider,
    providerAccountId: claims.sub,
    // Chỉ nhận email ĐÃ XÁC THỰC. Liên kết theo email chưa xác thực là mở đường
    // chiếm tài khoản người khác bằng chính email của họ.
    email: isVerified(claims.email_verified) ? (claims.email ?? null) : null,
    fullName: claims.name ?? null,
  };
}

async function fetchGithubProfile(accessToken: string): Promise<OAuthProfile> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "base-template",
  };

  const [userRes, emailsRes] = await Promise.all([
    fetch("https://api.github.com/user", { headers }),
    fetch("https://api.github.com/user/emails", { headers }),
  ]);

  if (!userRes.ok) throw new ProviderExchangeError("github", await userRes.text());

  const user = (await userRes.json()) as { id: number; name: string | null; login: string };

  // `/user/emails` có thể trả 403 nếu token thiếu scope `user:email` — không
  // coi là lỗi cứng, chỉ là không lấy được email.
  let email: string | null = null;
  if (emailsRes.ok) {
    const emails = (await emailsRes.json()) as Array<{
      email: string;
      primary: boolean;
      verified: boolean;
    }>;
    email = emails.find((item) => item.primary && item.verified)?.email ?? null;
  }

  return {
    provider: "github",
    providerAccountId: String(user.id),
    email,
    fullName: user.name ?? user.login,
  };
}

async function fetchFacebookProfile(accessToken: string): Promise<OAuthProfile> {
  const url = new URL("https://graph.facebook.com/v21.0/me");
  url.searchParams.set("fields", "id,name,email");
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url);
  if (!response.ok) throw new ProviderExchangeError("facebook", await response.text());

  const profile = (await response.json()) as { id: string; name?: string; email?: string };

  return {
    provider: "facebook",
    providerAccountId: profile.id,
    // Facebook chỉ trả field `email` khi đã xác thực quyền sở hữu — không có
    // field "verified" riêng để kiểm thêm.
    email: profile.email ?? null,
    fullName: profile.name ?? null,
  };
}

/**
 * `user` chỉ được Apple gửi (qua form POST, không phải trong token response)
 * trong LẦN ĐẦU người dùng cấp quyền — những lần sau `id_token` vẫn có nhưng
 * field này biến mất vĩnh viễn. Nơi gọi phải tự đọc và truyền xuống đây.
 */
export type AppleFormPostUser = { name?: { firstName?: string; lastName?: string } };

export async function fetchOAuthProfile(
  provider: OAuthProviderId,
  tokens: ExchangedTokens,
  appleUser?: AppleFormPostUser,
): Promise<OAuthProfile> {
  switch (provider) {
    case "github":
      return fetchGithubProfile(tokens.accessToken);
    case "facebook":
      return fetchFacebookProfile(tokens.accessToken);
    case "google": {
      if (!tokens.idToken) throw new ProviderExchangeError(provider, "Thiếu id_token");
      return fromIdToken("google", tokens.idToken);
    }
    case "apple": {
      if (!tokens.idToken) throw new ProviderExchangeError(provider, "Thiếu id_token");
      const profile = fromIdToken("apple", tokens.idToken);
      const name = appleUser?.name;
      if (name) {
        profile.fullName = [name.firstName, name.lastName].filter(Boolean).join(" ") || null;
      }
      return profile;
    }
  }
}
