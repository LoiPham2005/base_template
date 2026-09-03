import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { FastifyRequest } from "fastify";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import type {
  AuthenticatedRequest,
  CurrentUserPayload,
} from "../decorators/current-user.decorator";

/**
 * Xác thực access token. Đăng ký TOÀN CỤC trong `app.module.ts`.
 *
 * Mặc định mọi endpoint đều cần token; ngoại lệ phải khai bằng `@Public()`.
 * Xem ghi chú trong `public.decorator.ts` để hiểu vì sao chọn chiều đó.
 *
 * ---
 * GUARD NÀY CHỈ TRẢ LỜI "ANH LÀ AI", KHÔNG TRẢ LỜI "ANH ĐƯỢC LÀM GÌ"
 *
 * Câu hỏi thứ hai thuộc về `PermissionsGuard`, và nó tra database chứ không đọc
 * token. Trộn hai việc vào một guard là cách phổ biến nhất để quyền bị đóng
 * băng theo hạn của token.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request);

    if (isPublic) {
      /*
       * Endpoint công khai vẫn cố GẮN danh tính nếu có token hợp lệ.
       *
       * Lý do: nhiều endpoint công khai muốn cư xử khác một chút khi biết người
       * gọi là ai (ẩn nút, gắn cờ "đã đăng nhập"). Token hỏng thì bỏ qua —
       * KHÔNG ném lỗi, vì endpoint này vốn không cần đăng nhập.
       */
      if (token) {
        try {
          const payload = await this.jwt.verifyAsync<CurrentUserPayload>(token);
          if (payload.typ === "access") request.user = payload;
        } catch {
          // Cố ý im lặng.
        }
      }
      return true;
    }

    if (!token) {
      throw new UnauthorizedException("Vui lòng cung cấp Access Token hợp lệ");
    }

    let payload: CurrentUserPayload;

    try {
      payload = await this.jwt.verifyAsync<CurrentUserPayload>(token);
    } catch {
      // Không phân biệt "hết hạn" với "chữ ký sai" trong thông báo: client chỉ
      // cần biết phải gọi `/auth/refresh` rồi thử lại.
      throw new UnauthorizedException("Access Token không hợp lệ hoặc đã hết hạn");
    }

    /*
     * DANH SÁCH TRẮNG THEO LOẠI TOKEN — chốt chặn quan trọng nhất của guard này.
     *
     * Mọi JWT trong hệ thống đều ký bằng cùng một khoá, nên chữ ký hợp lệ KHÔNG
     * có nghĩa là token này dùng được ở đây. Thiếu phép kiểm dưới đây thì một
     * vé 2FA — thứ chỉ chứng minh "vừa nhập đúng mật khẩu" — sẽ được nhận như
     * một access token hoàn chỉnh, tức là bước thứ hai của 2FA bị bỏ qua hoàn
     * toàn. `state` của OAuth cũng vậy.
     *
     * Dùng danh sách trắng chứ không phải danh sách đen: loại token thêm sau
     * này bị từ chối theo mặc định.
     */
    if (payload.typ !== "access") {
      throw new UnauthorizedException("Token không dùng được cho endpoint này");
    }

    request.user = payload;

    return true;
  }
}

function extractBearerToken(request: FastifyRequest): string | undefined {
  const [scheme, token] = request.headers.authorization?.split(" ") ?? [];
  return scheme?.toLowerCase() === "bearer" ? token : undefined;
}
