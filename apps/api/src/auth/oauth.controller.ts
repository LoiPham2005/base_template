import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtService } from "@nestjs/jwt";
import type { FastifyReply, FastifyRequest } from "fastify";
import { isOAuthProviderId, type OAuthProviderId } from "@repo/contracts";
import {
  OAuthService,
  ProviderNotConfiguredError,
  appUrl,
  buildAuthorizationUrl,
  configuredProviders,
  createCodeChallenge,
  exchangeCodeForToken,
  fetchOAuthProfile,
  generateCodeVerifier,
  generateOAuthState,
  isProviderConfigured,
  logger,
} from "@repo/core";
import { Public } from "../common/decorators/public.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { clientIp, userAgent } from "../common/request";
import { SessionService } from "./session.service";

/**
 * Đăng nhập bằng Google / GitHub / Facebook / Apple.
 *
 * ---
 * `state` ĐƯỢC GIỮ Ở ĐÂU, VÀ VÌ SAO
 *
 * Luồng OAuth cần mang `code_verifier` (PKCE) và một giá trị `state` chống CSRF
 * đi qua trình duyệt của người dùng rồi quay lại. Có hai chỗ để giữ:
 *
 *   - Trong database → thêm một bảng, thêm việc dọn dẹp, cho một thứ sống 5 phút.
 *   - Trong một JWT ngắn hạn do CHÍNH server ký → không lưu gì cả.
 *
 * Chọn cách thứ hai. `state` mà client trả về là một JWT: nếu chữ ký không hợp
 * lệ thì nó không do ta phát ra, và nếu quá 10 phút thì nó đã hết hạn. Kẻ tấn
 * công không tự tạo được `state` hợp lệ, nên không dựng được một luồng đăng
 * nhập giả rồi ép nạn nhân hoàn tất.
 *
 * ---
 * VÌ SAO CALLBACK CHUYỂN HƯỚNG VỀ WEB THAY VÌ TRẢ JSON
 *
 * Provider redirect TRÌNH DUYỆT tới đây, không phải gọi bằng `fetch`. Trả JSON
 * nghĩa là người dùng nhìn thấy một trang trắng đầy dấu ngoặc nhọn. Nên: đổi
 * xong token thì redirect về `APP_URL` kèm mã một lần, và web đổi mã đó lấy
 * token qua `POST /auth/oauth/exchange`.
 */
@ApiTags("auth")
@Controller("auth/oauth")
export class OAuthController {
  /** Hạn của `state`. Đủ để người dùng đăng nhập ở phía provider, không hơn. */
  private static readonly STATE_TTL = "10m";
  /** Hạn của mã một lần trả về cho web. Rất ngắn — web đổi nó ngay khi tải trang. */
  private static readonly EXCHANGE_TTL = "2m";

  constructor(
    private readonly oauth: OAuthService,
    private readonly sessions: SessionService,
    private readonly jwt: JwtService,
  ) {}

  @Public()
  @Get("providers")
  @ApiOperation({ summary: "Danh sách nhà cung cấp đã cấu hình" })
  providers(): { providers: OAuthProviderId[] } {
    // Web chỉ hiện đúng những nút dùng được. Hiện một nút chưa cấu hình là dẫn
    // người dùng tới một trang lỗi của Google.
    return { providers: configuredProviders() };
  }

  @Public()
  @Get(":provider/start")
  @ApiOperation({ summary: "Bắt đầu luồng đăng nhập — chuyển hướng sang nhà cung cấp" })
  async start(@Param("provider") provider: string, @Res() reply: FastifyReply): Promise<void> {
    const id = this.parseProvider(provider);

    const codeVerifier = generateCodeVerifier();
    const nonce = generateOAuthState();

    // `state` mang theo `codeVerifier` — đó là lý do nó phải được KÝ chứ không
    // chỉ là chuỗi ngẫu nhiên: bất kỳ ai sửa được nội dung này là vô hiệu hoá
    // luôn PKCE.
    // `typ` để `JwtAuthGuard` từ chối token này nếu ai đó thử dùng nó làm
    // access token — mọi JWT ở đây đều ký bằng cùng một khoá, nên chữ ký hợp lệ
    // không có nghĩa là dùng được ở mọi nơi.
    const state = await this.jwt.signAsync(
      { typ: "oauth_state", provider: id, codeVerifier, nonce },
      { expiresIn: OAuthController.STATE_TTL },
    );

    const url = buildAuthorizationUrl(id, {
      state,
      codeChallenge: createCodeChallenge(codeVerifier),
    });

    await reply.redirect(url.toString(), 302);
  }

  /**
   * Nơi provider redirect người dùng quay lại.
   *
   * Apple dùng `response_mode=form_post` nên gửi POST; các provider còn lại
   * dùng GET. Cùng một hàm xử lý cả hai — khác biệt chỉ nằm ở chỗ đọc tham số.
   */
  @Public()
  @Get(":provider/callback")
  @ApiExcludeEndpoint()
  async callbackGet(
    @Param("provider") provider: string,
    @Query() query: Record<string, string>,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    await this.handleCallback(provider, query, request, reply);
  }

  @Public()
  @Post(":provider/callback")
  @ApiExcludeEndpoint()
  async callbackPost(
    @Param("provider") provider: string,
    @Body() body: Record<string, string>,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    await this.handleCallback(provider, body, request, reply);
  }

  private async handleCallback(
    provider: string,
    params: Record<string, string>,
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const id = this.parseProvider(provider);

    try {
      // Người dùng bấm "Huỷ" ở màn hình của provider. Không phải lỗi hệ thống —
      // đưa họ về trang đăng nhập với một thông điệp bình thường.
      if (params.error) {
        return await this.redirectToWeb(reply, { error: "oauth_cancelled" });
      }

      const { code, state } = params;
      if (!code || !state) {
        return await this.redirectToWeb(reply, { error: "oauth_invalid_response" });
      }

      const claims = await this.jwt.verifyAsync<{
        typ?: string;
        provider: string;
        codeVerifier: string;
      }>(state);

      // Sai loại token, hoặc `state` của provider KHÁC: cả hai đều là dấu hiệu
      // ai đó đang ghép các luồng lại với nhau.
      if (claims.typ !== "oauth_state" || claims.provider !== id) {
        return await this.redirectToWeb(reply, { error: "oauth_state_mismatch" });
      }

      const tokens = await exchangeCodeForToken(id, code, claims.codeVerifier);

      // Apple chỉ gửi `user` (họ tên) trong LẦN ĐẦU cấp quyền, và gửi qua form
      // POST chứ không nằm trong token response.
      const appleUser = params.user
        ? (JSON.parse(params.user) as { name?: { firstName?: string; lastName?: string } })
        : undefined;

      const profile = await fetchOAuthProfile(id, tokens, appleUser);
      const user = await this.oauth.loginWithProfile(profile);

      const pair = await this.sessions.issue(user, {
        userAgent: userAgent(request),
        ip: clientIp(request),
      });

      // Không nhét access token vào URL: nó nằm lại trong lịch sử trình duyệt,
      // trong log của proxy, và trong header `Referer` gửi sang mọi ảnh trên
      // trang kế tiếp. Mã một lần thì đổi xong là hết giá trị.
      const exchangeCode = await this.jwt.signAsync(
        { typ: "oauth_exchange", sub: user.id, pair },
        { expiresIn: OAuthController.EXCHANGE_TTL },
      );

      await this.redirectToWeb(reply, { code: exchangeCode });
    } catch (error) {
      // Callback KHÔNG được trả JSON lỗi: đây là một trang trong trình duyệt.
      // Ghi log đầy đủ, còn người dùng thì được đưa về trang đăng nhập.
      logger.error("OAuth callback thất bại", error, { provider: id });
      await this.redirectToWeb(reply, { error: "oauth_failed" });
    }
  }

  /**
   * Đổi mã một lần lấy token thật.
   *
   * Web gọi endpoint này ngay khi tải trang callback, rồi xoá tham số khỏi URL.
   */
  @Public()
  @Post("exchange")
  @ApiOperation({ summary: "Đổi mã một lần từ luồng OAuth lấy cặp token" })
  async exchange(@Body() body: { code?: string }) {
    if (!body.code) throw new BadRequestException("Thiếu mã trao đổi");

    try {
      const claims = await this.jwt.verifyAsync<{ typ?: string; sub: string; pair: unknown }>(
        body.code,
      );

      if (claims.typ !== "oauth_exchange") throw new Error("sai loại token");

      return claims.pair;
    } catch {
      throw new BadRequestException("Mã trao đổi không hợp lệ hoặc đã hết hạn");
    }
  }

  @Get("linked")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Các nhà cung cấp đã liên kết với tài khoản" })
  async linked(@CurrentUser("sub") userId: string) {
    return this.oauth.listLinked(userId);
  }

  @Delete(":provider")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Gỡ liên kết một nhà cung cấp" })
  async unlink(@CurrentUser("sub") userId: string, @Param("provider") provider: string) {
    await this.oauth.unlink(userId, this.parseProvider(provider));
    return { unlinked: provider };
  }

  private parseProvider(value: string): OAuthProviderId {
    if (!isOAuthProviderId(value)) {
      throw new BadRequestException(`Nhà cung cấp "${value}" không được hỗ trợ`);
    }
    // Kiểm ở đây để lỗi cấu hình hiện ra rõ ràng, thay vì thành một lần
    // redirect sang Google với `client_id=undefined`.
    if (!isProviderConfigured(value)) throw new ProviderNotConfiguredError(value);
    return value;
  }

  private async redirectToWeb(reply: FastifyReply, params: Record<string, string>): Promise<void> {
    const target = new URL(appUrl("/auth/callback"));
    for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
    await reply.redirect(target.toString(), 302);
  }
}
