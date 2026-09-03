import { apiUrl, env } from "../../config/env";
import type { OAuthProviderId } from "@repo/contracts";

export type ProviderConfig = {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  scope: string;
  /** `false` = provider không hỗ trợ PKCE (OAuth App cổ điển của GitHub). */
  usePkce: boolean;
  /** Apple bắt buộc `response_mode=form_post` khi xin scope name/email. */
  responseMode?: "form_post";
  clientId: string | undefined;
};

export const PROVIDER_CONFIG: Record<OAuthProviderId, ProviderConfig> = {
  google: {
    authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
    scope: "openid email profile",
    usePkce: true,
    clientId: env.GOOGLE_CLIENT_ID,
  },
  github: {
    authorizationEndpoint: "https://github.com/login/oauth/authorize",
    tokenEndpoint: "https://github.com/login/oauth/access_token",
    scope: "read:user user:email",
    usePkce: false,
    clientId: env.GITHUB_CLIENT_ID,
  },
  facebook: {
    authorizationEndpoint: "https://www.facebook.com/v21.0/dialog/oauth",
    tokenEndpoint: "https://graph.facebook.com/v21.0/oauth/access_token",
    scope: "email public_profile",
    usePkce: true,
    clientId: env.FACEBOOK_CLIENT_ID,
  },
  apple: {
    authorizationEndpoint: "https://appleid.apple.com/auth/authorize",
    tokenEndpoint: "https://appleid.apple.com/auth/token",
    scope: "name email",
    usePkce: false,
    responseMode: "form_post",
    clientId: env.APPLE_CLIENT_ID,
  },
};

/**
 * Provider đã đủ credential để dùng chưa. Route `start`/`callback` gọi hàm này
 * trước tiên — thiếu cấu hình phải báo lỗi rõ ràng, không được 500 mù mờ.
 */
export function isProviderConfigured(provider: OAuthProviderId): boolean {
  switch (provider) {
    case "google":
      return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
    case "github":
      return Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);
    case "facebook":
      return Boolean(env.FACEBOOK_CLIENT_ID && env.FACEBOOK_CLIENT_SECRET);
    case "apple":
      return Boolean(
        env.APPLE_CLIENT_ID && env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY,
      );
  }
}

/** Danh sách provider dùng được — web hiện đúng những nút đang bật. */
export function configuredProviders(): OAuthProviderId[] {
  return (Object.keys(PROVIDER_CONFIG) as OAuthProviderId[]).filter(isProviderConfigured);
}

/**
 * `redirect_uri` phải TUYỆT ĐỐI và khớp 100% với cấu hình trên console của
 * provider — sai một dấu `/` là lỗi `redirect_uri_mismatch`.
 *
 * Dựng từ `API_PUBLIC_URL` chứ KHÔNG phải `APP_URL`: provider redirect trình
 * duyệt về đúng endpoint của API này, không phải về trang web. Hai giá trị đó
 * chỉ trùng nhau khi web và API nằm sau cùng một tên miền.
 */
export function callbackUrl(provider: OAuthProviderId): string {
  return apiUrl(`/api/v1/auth/oauth/${provider}/callback`);
}
