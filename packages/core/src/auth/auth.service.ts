import type { PrismaClient } from "@repo/db";
import {
  SYSTEM_ROLES,
  type LoginInput,
  type PublicUser,
  type RegisterInput,
} from "@repo/contracts";
import { CryptoUtils } from "../common/crypto";
import { env } from "../config/env";
import { logger } from "../common/logger";
import {
  AccountBannedError,
  AccountLockedError,
  InvalidCredentialsError,
  InvalidVerificationTokenError,
} from "../common/errors";
import {
  sendPasswordChangedEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "../infra/emails";
import { UserService, toPublicUser } from "../user/user.service";
import type { VerificationService } from "./verification.service";
import type { TokenService } from "./token.service";

/**
 * Luồng xác thực: đăng ký, đăng nhập, xác thực email, đặt lại / đổi mật khẩu.
 *
 * ⚠️ Service này KHÔNG ký JWT. Việc đó thuộc về `apps/api` (nơi có
 * `JwtService` của NestJS và biết `JWT_SECRET`) — giữ `packages/core` không
 * phụ thuộc framework, và nhờ vậy `apps/worker` import được nó mà không phải
 * khai `JWT_SECRET`.
 */
export class AuthService {
  constructor(
    private readonly db: PrismaClient,
    private readonly users: UserService,
    private readonly verification: VerificationService,
    private readonly tokens: TokenService,
  ) {}

  /**
   * Đăng ký công khai.
   *
   * Vai trò LUÔN là USER và KHÔNG đọc từ input — nếu đọc, bất kỳ ai gọi
   * `POST /auth/register` cũng tự phong mình làm ADMIN.
   */
  async register(input: RegisterInput): Promise<PublicUser> {
    const user = await this.users.create({
      email: input.email,
      password: input.password,
      username: input.username,
      fullName: input.fullName,
      status: "ACTIVE",
      roleKeys: [SYSTEM_ROLES.USER],
    });

    // Gửi thư xác thực nhưng KHÔNG chặn việc đăng ký nếu gửi hỏng: tài khoản
    // đã tạo xong rồi, ném lỗi ở đây chỉ khiến người dùng thấy "đăng ký thất
    // bại" cho một thao tác thật ra đã thành công. Họ bấm "gửi lại" được.
    await this.sendEmailVerification(user.id).catch((error: unknown) => {
      logger.error("Không gửi được email xác thực sau khi đăng ký", error, { userId: user.id });
    });

    return user;
  }

  /**
   * Xác thực thông tin đăng nhập.
   *
   * Ba nhánh thất bại — không tìm thấy tài khoản, tài khoản chưa đặt mật khẩu,
   * sai mật khẩu — đều ném CÙNG một lỗi và đều tiêu tốn thời gian như nhau.
   * Nếu không, chỉ cần đo thời gian phản hồi là biết được email nào đã đăng ký.
   *
   * Tài khoản BANNED hoặc đang `lockedUntil` chỉ bị tiết lộ SAU KHI mật khẩu đã
   * đúng. Tiết lộ trước là một oracle: kẻ dò mật khẩu mù sẽ biết tài khoản nào
   * tồn tại/đã bị khoá mà không cần đoán trúng gì.
   */
  async validateCredentials(input: LoginInput): Promise<PublicUser> {
    // Ký tự `@` là thứ duy nhất phân biệt được hai loại: `usernameSchema` cấm
    // `@`, nên một chuỗi có `@` không thể là tên đăng nhập hợp lệ.
    const identifier = input.identifier.trim().toLowerCase();
    const isEmail = identifier.includes("@");

    const user = await this.db.user.findFirst({
      where: {
        deletedAt: null,
        ...(isEmail ? { email: identifier } : { username: identifier }),
      },
      select: {
        id: true,
        email: true,
        phone: true,
        username: true,
        password: true,
        status: true,
        emailVerifiedAt: true,
        failedLoginAttempts: true,
        lockedUntil: true,
        createdAt: true,
        updatedAt: true,
        profile: { select: { fullName: true, avatarUrl: true } },
        userRoles: { select: { role: { select: { key: true } } } },
      },
    });

    if (!user?.password) {
      await CryptoUtils.fakeCompare(input.password);
      throw new InvalidCredentialsError();
    }

    const check = await CryptoUtils.verifyPassword(input.password, user.password);

    if (!check.valid) {
      await this.registerFailedAttempt(
        user.id,
        Boolean(user.lockedUntil && user.lockedUntil > new Date()),
      );
      throw new InvalidCredentialsError();
    }

    if (user.status === "BANNED") throw new AccountBannedError();

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AccountLockedError(user.lockedUntil);
    }

    // Đăng nhập đúng sau một chuỗi lần sai — xoá dấu vết, đừng bắt họ trả giá
    // cho những lần gõ nhầm đã qua.
    if (user.failedLoginAttempts > 0) {
      await this.db.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    if (check.needsRehash) await this.upgradePasswordHash(user.id, input.password);

    const {
      password: _password,
      failedLoginAttempts: _attempts,
      lockedUntil: _locked,
      ...rest
    } = user;
    return toPublicUser(rest);
  }

  /**
   * Tăng bộ đếm sai mật khẩu; khoá tạm khi chạm ngưỡng.
   *
   * Bổ sung cho rate-limit theo IP: rate-limit chặn MỘT IP dò NHIỀU tài khoản,
   * còn cái này chặn NHIỀU IP cùng dò MỘT tài khoản.
   *
   * Không tăng/khoá lại nếu đã đang bị khoá — tránh việc một loạt request tới
   * trong lúc khoá cứ đẩy `lockedUntil` lùi thêm vô hạn.
   */
  private async registerFailedAttempt(userId: string, alreadyLocked: boolean): Promise<void> {
    if (alreadyLocked) return;

    const updated = await this.db.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: { increment: 1 } },
      select: { failedLoginAttempts: true },
    });

    if (updated.failedLoginAttempts >= env.LOGIN_MAX_FAILED_ATTEMPTS) {
      await this.db.user.update({
        where: { id: userId },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: new Date(Date.now() + env.LOGIN_LOCKOUT_MINUTES * 60 * 1000),
        },
      });
    }
  }

  /**
   * Băm lại mật khẩu bằng thuật toán hiện hành và ghi đè.
   *
   * Đây là cách chuyển dần kho mật khẩu cũ (bcrypt) sang Argon2id mà không bắt
   * ai đổi mật khẩu: mỗi lần đăng nhập thành công là một bản ghi được nâng cấp.
   *
   * Lỗi ở đây bị nuốt CÓ CHỦ ĐÍCH. Người dùng vừa nhập đúng mật khẩu — chặn họ
   * đăng nhập chỉ vì thao tác nâng cấp nền phía sau thất bại là hành vi sai.
   */
  private async upgradePasswordHash(userId: string, plainPassword: string): Promise<void> {
    try {
      const password = await CryptoUtils.hashPassword(plainPassword);
      await this.db.user.update({ where: { id: userId }, data: { password } });
    } catch (error) {
      logger.error("Không nâng cấp được hash mật khẩu", error, { userId });
    }
  }

  // -------------------------------------------------------------------------
  // Xác thực email
  // -------------------------------------------------------------------------

  /**
   * Cấp token xác thực và gửi email. Không làm gì nếu email đã được xác thực —
   * tránh việc bấm nhầm nút "gửi lại" làm mất hiệu lực trạng thái đang đúng.
   */
  async sendEmailVerification(userId: string): Promise<void> {
    const user = await this.db.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, email: true, emailVerifiedAt: true },
    });

    if (!user?.email || user.emailVerifiedAt) return;

    const { token } = await this.verification.issue(user.id, "EMAIL_VERIFICATION");
    await sendVerificationEmail(user.email, token);
  }

  /**
   * Gửi lại thư xác thực theo địa chỉ email.
   *
   * KHÔNG bao giờ tiết lộ email có tồn tại hay không — endpoint này công khai,
   * và bất kỳ khác biệt nào cũng biến nó thành công cụ dò danh sách người dùng.
   */
  async resendEmailVerification(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user) return;
    await this.sendEmailVerification(user.id);
  }

  /**
   * Xác thực email bằng token trong link.
   *
   * Ghi `emailVerifiedAt` CHỈ KHI nó đang null: người dùng bấm lại link cũ sau
   * khi đã xác thực thì không được ghi đè mốc thời gian ban đầu.
   */
  async verifyEmail(token: string): Promise<PublicUser> {
    const userId = await this.verification.consume(token, "EMAIL_VERIFICATION");
    if (!userId) throw new InvalidVerificationTokenError();

    await this.db.user.updateMany({
      where: { id: userId, emailVerifiedAt: null },
      data: { emailVerifiedAt: new Date() },
    });

    const user = await this.users.findById(userId);
    if (!user) throw new InvalidVerificationTokenError();

    return user;
  }

  // -------------------------------------------------------------------------
  // Đặt lại / đổi mật khẩu
  // -------------------------------------------------------------------------

  /**
   * Gửi link đặt lại mật khẩu.
   *
   * ⚠️ KHÔNG BAO GIỜ báo cho bên gọi biết email có tồn tại hay không.
   *
   * Tài khoản chưa đặt mật khẩu (admin tạo hộ, hoặc chỉ đăng nhập qua OAuth)
   * VẪN được cấp link: đó chính là cách hợp lệ để họ đặt mật khẩu lần đầu.
   */
  async requestPasswordReset(email: string): Promise<void> {
    // Đi qua `users.findByEmail` thay vì tự viết truy vấn, vì nó giữ hai luật
    // mà chỗ này rất dễ bỏ sót — và cả hai đều hỏng trong im lặng: chuẩn hoá
    // chữ thường, và bỏ qua tài khoản đã xoá mềm.
    const user = await this.users.findByEmail(email);
    if (!user?.email) return;

    const { token } = await this.verification.issue(user.id, "PASSWORD_RESET");
    await sendPasswordResetEmail(user.email, token);
  }

  /**
   * Đặt mật khẩu mới bằng token trong link.
   *
   * Thu hồi TOÀN BỘ refresh token sau khi đổi. Đây là phần bắt buộc, không phải
   * tuỳ chọn: kịch bản điển hình của luồng này là tài khoản đã bị chiếm. Đổi
   * mật khẩu mà để phiên cũ của kẻ tấn công còn sống thì việc đổi gần như vô
   * nghĩa.
   */
  async resetPassword(token: string, newPassword: string): Promise<string> {
    const userId = await this.verification.consume(token, "PASSWORD_RESET");
    if (!userId) throw new InvalidVerificationTokenError();

    const password = await CryptoUtils.hashPassword(newPassword);

    const user = await this.db.user.update({
      where: { id: userId },
      data: { password, failedLoginAttempts: 0, lockedUntil: null },
      select: { id: true, email: true },
    });

    await this.tokens.revokeAllForUser(userId);

    if (user.email) {
      await sendPasswordChangedEmail(user.email).catch((error: unknown) => {
        logger.error("Không gửi được email thông báo đổi mật khẩu", error, { userId });
      });
    }

    logger.info("Mật khẩu được đặt lại", { userId });
    return userId;
  }

  /**
   * Đổi mật khẩu khi đang đăng nhập.
   *
   * Bắt nhập lại mật khẩu hiện tại DÙ đã đăng nhập: nếu không, ai ngồi vào máy
   * đang mở sẵn phiên là chiếm được tài khoản vĩnh viễn.
   *
   * @param keepSessionId Phiên được giữ lại — chính là phiên đang thực hiện
   * thao tác này. Không có tham số này thì người dùng bị đăng xuất khỏi chính
   * thiết bị họ vừa thao tác, một trải nghiệm trông y như lỗi.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    keepSessionId?: string,
  ): Promise<void> {
    const user = await this.db.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, email: true, password: true },
    });

    if (!user?.password) {
      await CryptoUtils.fakeCompare(currentPassword);
      throw new InvalidCredentialsError();
    }

    const check = await CryptoUtils.verifyPassword(currentPassword, user.password);
    if (!check.valid) throw new InvalidCredentialsError();

    const password = await CryptoUtils.hashPassword(newPassword);

    await this.db.user.update({ where: { id: userId }, data: { password } });
    await this.tokens.revokeAllForUser(userId, { exceptId: keepSessionId });

    if (user.email) {
      await sendPasswordChangedEmail(user.email).catch((error: unknown) => {
        logger.error("Không gửi được email thông báo đổi mật khẩu", error, { userId });
      });
    }

    logger.info("Mật khẩu được đổi", { userId });
  }
}
