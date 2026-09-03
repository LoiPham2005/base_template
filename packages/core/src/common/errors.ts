/**
 * Lỗi NGHIỆP VỤ, khai báo tập trung.
 *
 * ---
 * VÌ SAO KHÔNG NÉM THẲNG HttpException CỦA NESTJS
 *
 * `packages/core` không được biết gì về HTTP. Cùng một `UserNotFoundError` có
 * thể tới từ REST API (→ 404), từ một job nền (→ ghi log rồi bỏ qua), hoặc từ
 * script CLI (→ in ra rồi thoát). Gắn mã HTTP ngay tại chỗ ném lỗi là ép cả ba
 * nơi phải hiểu theo cách của cái đầu tiên.
 *
 * Việc ánh xạ sang HTTP nằm gọn trong `apps/api/src/common/filters/`.
 *
 * ---
 * VÌ SAO CÓ `code`
 *
 * `code` là thứ client (Flutter/web) nên `switch` theo — nó là hợp đồng.
 * `message` để hiển thị cho người dùng và có thể đổi lời văn bất cứ lúc nào.
 * Client so sánh theo message là code sẽ hỏng ngay lần đầu ai đó sửa chính tả.
 */

export type DomainErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "ACCOUNT_BANNED"
  | "ACCOUNT_LOCKED"
  | "RATE_LIMITED"
  | "PROVIDER_ERROR";

export abstract class DomainError extends Error {
  abstract readonly code: DomainErrorCode;
  /** Lỗi theo từng trường, dùng cho VALIDATION_ERROR. */
  readonly fields?: Record<string, string[]>;

  protected constructor(message: string, fields?: Record<string, string[]>) {
    super(message);
    this.name = new.target.name;
    this.fields = fields;
  }
}

// ---------------------------------------------------------------------------
// Xác thực
// ---------------------------------------------------------------------------

/**
 * Dùng chung cho MỌI lý do đăng nhập hỏng: email không tồn tại, tài khoản chưa
 * đặt mật khẩu, sai mật khẩu.
 *
 * Gộp lại có chủ đích — phân biệt ba trường hợp là xác nhận cho người đang dò
 * biết tài khoản nào có thật.
 */
export class InvalidCredentialsError extends DomainError {
  readonly code = "UNAUTHENTICATED" as const;
  constructor() {
    super("Thông tin đăng nhập không chính xác");
  }
}

/** Khoá thủ công bởi admin (`UserStatus.BANNED`) — không tự hết hạn. */
export class AccountBannedError extends DomainError {
  readonly code = "ACCOUNT_BANNED" as const;
  constructor() {
    super("Tài khoản đã bị khoá. Vui lòng liên hệ quản trị viên.");
  }
}

/** Khoá tạm tự động do sai mật khẩu liên tiếp — tự hết hạn tại `lockedUntil`. */
export class AccountLockedError extends DomainError {
  readonly code = "ACCOUNT_LOCKED" as const;
  constructor(readonly lockedUntil: Date) {
    super(
      `Tài khoản tạm khoá do đăng nhập sai quá nhiều lần. Thử lại sau ${Math.max(
        1,
        Math.ceil((lockedUntil.getTime() - Date.now()) / 60_000),
      )} phút.`,
    );
  }
}

/**
 * Dùng chung cho mọi lý do token không dùng được: không tồn tại, sai loại, đã
 * dùng, hết hạn. Phân biệt "đã dùng" với "không tồn tại" là xác nhận cho người
 * hỏi biết token đó từng hợp lệ.
 */
export class InvalidVerificationTokenError extends DomainError {
  readonly code = "VALIDATION_ERROR" as const;
  constructor() {
    super("Liên kết không hợp lệ hoặc đã hết hạn");
  }
}

/**
 * Refresh token đã bị thu hồi nhưng vẫn được dùng lại.
 *
 * Chỉ có một cách giải thích hợp lý: nó đã bị đánh cắp. Không thể biết bên nào
 * là kẻ trộm, nên `TokenService` huỷ TOÀN BỘ phiên của tài khoản đó.
 */
export class RefreshTokenReuseError extends DomainError {
  readonly code = "UNAUTHENTICATED" as const;
  constructor(readonly userId: string) {
    super("Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.");
  }
}

export class InvalidRefreshTokenError extends DomainError {
  readonly code = "UNAUTHENTICATED" as const;
  constructor() {
    super("Refresh token không hợp lệ hoặc đã hết hạn");
  }
}

// ---------------------------------------------------------------------------
// Người dùng
// ---------------------------------------------------------------------------

export class UserNotFoundError extends DomainError {
  readonly code = "NOT_FOUND" as const;
  constructor(id?: string) {
    super(id ? `Không tìm thấy người dùng "${id}"` : "Không tìm thấy người dùng");
  }
}

export class DuplicateFieldError extends DomainError {
  readonly code = "CONFLICT" as const;
  constructor(field: "email" | "username" | "phone", value?: string) {
    const label = { email: "Email", username: "Tên đăng nhập", phone: "Số điện thoại" }[field];
    super(`${label}${value ? ` "${value}"` : ""} đã được sử dụng`, {
      [field]: [`${label} đã được sử dụng`],
    });
  }
}

/**
 * Chặn tự bắn vào chân mình: hạ quyền, khoá hoặc xoá CHÍNH tài khoản đang thao
 * tác. Không có chốt này thì quản trị viên cuối cùng của hệ thống tự khoá mình
 * ra ngoài chỉ bằng một cú bấm nhầm, và không còn ai vào sửa được.
 */
export class SelfActionForbiddenError extends DomainError {
  readonly code = "CONFLICT" as const;
  constructor(action: string) {
    super(`Bạn không thể tự ${action} chính tài khoản của mình`);
  }
}

// ---------------------------------------------------------------------------
// Vai trò & quyền
// ---------------------------------------------------------------------------

export class RoleNotFoundError extends DomainError {
  readonly code = "NOT_FOUND" as const;
  constructor(key: string) {
    super(`Không tìm thấy vai trò "${key}"`);
  }
}

/**
 * Vai trò gửi kèm khi tạo/sửa NGƯỜI DÙNG không tồn tại.
 *
 * Khác `RoleNotFoundError`: ở đây tài nguyên bị hỏi tới (user) không hề thiếu,
 * chỉ một trường trong body là sai — nên nó là lỗi validate (422), không phải
 * 404.
 */
export class UnknownRoleKeyError extends DomainError {
  readonly code = "VALIDATION_ERROR" as const;
  constructor(keys: string[]) {
    super(`Vai trò không tồn tại: ${keys.join(", ")}`, {
      roleKeys: [`Vai trò không tồn tại: ${keys.join(", ")}`],
    });
  }
}

export class RoleKeyAlreadyExistsError extends DomainError {
  readonly code = "CONFLICT" as const;
  constructor(key: string) {
    super(`Vai trò "${key}" đã tồn tại`);
  }
}

export class SystemRoleImmutableError extends DomainError {
  readonly code = "CONFLICT" as const;
  constructor(key: string) {
    super(`"${key}" là vai trò hệ thống — không được xoá hoặc đổi mã`);
  }
}

export class RoleInUseError extends DomainError {
  readonly code = "CONFLICT" as const;
  constructor(key: string, userCount: number) {
    super(`Vai trò "${key}" đang được gán cho ${userCount} người dùng — gỡ hết trước khi xoá`);
  }
}

/**
 * Quyền không có trong danh mục của code.
 *
 * Chặn ở đây thay vì lặng lẽ bỏ qua: ghi một quyền không tồn tại vào database
 * tạo ra bản ghi chết mà người quản trị vẫn thấy đã tick — họ tưởng đã cấp
 * quyền, mà không dòng mã nào kiểm tra nó.
 */
export class UnknownPermissionError extends DomainError {
  readonly code = "VALIDATION_ERROR" as const;
  constructor(keys: string[]) {
    super(`Quyền không tồn tại trong hệ thống: ${keys.join(", ")}`, {
      permissions: [`Quyền không tồn tại: ${keys.join(", ")}`],
    });
  }
}

export class ForbiddenError extends DomainError {
  readonly code = "FORBIDDEN" as const;
  constructor(message = "Bạn không có quyền thực hiện thao tác này") {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Bên thứ ba
// ---------------------------------------------------------------------------

export class ProviderNotConfiguredError extends DomainError {
  readonly code = "PROVIDER_ERROR" as const;
  constructor(provider: string) {
    super(`Đăng nhập bằng ${provider} chưa được cấu hình`);
  }
}

export class ProviderExchangeError extends DomainError {
  readonly code = "PROVIDER_ERROR" as const;
  constructor(provider: string, cause?: unknown) {
    super(`Không đăng nhập được bằng ${provider}. Vui lòng thử lại.`);
    this.cause = cause;
  }
}

export class OAuthEmailRequiredError extends DomainError {
  readonly code = "VALIDATION_ERROR" as const;
  constructor(provider: string) {
    super(
      `Tài khoản ${provider} của bạn không có email đã xác thực để liên kết. ` +
        `Vui lòng công khai/xác thực email trên ${provider} rồi thử lại.`,
    );
  }
}
