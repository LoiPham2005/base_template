import { hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2";
import { compare as bcryptCompare } from "bcryptjs";

/**
 * Băm và kiểm tra mật khẩu.
 *
 * ---
 * VÌ SAO ARGON2ID CHỨ KHÔNG PHẢI BCRYPT
 *
 * Argon2id là lựa chọn số một của OWASP hiện nay. Khác biệt cốt lõi: bcrypt chỉ
 * tốn CPU, còn Argon2id tốn CPU *và* bộ nhớ. Kẻ tấn công dựng dàn GPU/ASIC để
 * dò offline bị chặn bởi băng thông bộ nhớ chứ không phải số nhân — thứ đắt và
 * khó mở rộng hơn nhiều.
 *
 * Dùng `@node-rs/argon2` (Rust, nạp qua N-API) thay vì bản JavaScript thuần:
 * bản JS chạy trên chính luồng của Node, nên vài người đăng nhập đồng thời là
 * cả tiến trình khựng lại. Bản Rust chạy ngoài luồng chính và có sẵn bản dựng
 * cho musl, nên image Alpine không phải biên dịch gì.
 *
 * ---
 * VÌ SAO VẪN GIỮ BCRYPT
 *
 * Dự án có sẵn (hoặc dữ liệu nhập từ hệ thống cũ) thường mang hash bcrypt. Gỡ
 * bcrypt đi là mọi tài khoản cũ mất quyền đăng nhập vĩnh viễn — không có cách
 * nào chuyển một hash sang thuật toán khác mà không biết mật khẩu gốc.
 *
 * Cách xử lý: vẫn kiểm tra được hash bcrypt, và ngay lúc đó — khi mật khẩu gốc
 * còn trong bộ nhớ — băm lại bằng Argon2id rồi ghi đè. Người dùng không thấy
 * gì khác, còn dữ liệu tự chuyển dần sau mỗi lần đăng nhập.
 */

/**
 * Mã của thuật toán Argon2id trong `@node-rs/argon2`.
 *
 * Viết thẳng số thay vì import `Algorithm.Argon2id`: đó là ambient const enum,
 * mà `isolatedModules` trong tsconfig cấm truy cập loại enum này.
 */
const ARGON2ID = 2;

/**
 * Tham số theo khuyến nghị OWASP: 19 MiB bộ nhớ, 2 lượt, 1 luồng.
 *
 * Ghi rõ ra đây thay vì dựa vào mặc định của thư viện, vì tham số nằm ngay
 * trong chuỗi hash: đổi tham số là mọi hash cũ bị coi là lỗi thời và được băm
 * lại ở lần đăng nhập kế tiếp. Đó là hành vi mong muốn, nhưng phải cố ý.
 */
const ARGON2_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * Tiền tố mà một hash "đạt chuẩn hiện tại" phải có. Hash Argon2 tự mang tham
 * số của nó (`$argon2id$v=19$m=19456,t=2,p=1$...`), nên so tiền tố là cách rẻ
 * nhất để biết hash có được sinh bằng đúng cấu hình đang dùng không.
 */
const CURRENT_HASH_PREFIX = `$argon2id$v=19$m=${ARGON2_OPTIONS.memoryCost},t=${ARGON2_OPTIONS.timeCost},p=${ARGON2_OPTIONS.parallelism}$`;

/** Mọi biến thể bcrypt đều bắt đầu bằng `$2` — `$2a$`, `$2b$`, `$2y$`. */
function isBcryptHash(value: string): boolean {
  return value.startsWith("$2");
}

/**
 * Hash dùng cho phép so sánh giả. Tính một lần rồi cache.
 *
 * Không có nó, "email không tồn tại" trả về nhanh hơn hẳn "sai mật khẩu", và
 * kẻ tấn công chỉ cần đo thời gian phản hồi là dò ra email nào đã đăng ký.
 */
let dummyHashPromise: Promise<string> | null = null;

function getDummyHash(): Promise<string> {
  dummyHashPromise ??= argon2Hash("timing-attack-placeholder", ARGON2_OPTIONS);
  return dummyHashPromise;
}

export type PasswordCheck = {
  valid: boolean;
  /**
   * `true` khi mật khẩu ĐÚNG nhưng hash được sinh bằng thuật toán/tham số cũ.
   * Nơi gọi nên băm lại và ghi đè — đây là cửa sổ duy nhất còn giữ mật khẩu
   * gốc trong bộ nhớ.
   */
  needsRehash: boolean;
};

export const CryptoUtils = {
  hashPassword(password: string): Promise<string> {
    return argon2Hash(password, ARGON2_OPTIONS);
  },

  /**
   * Kiểm tra mật khẩu, tự nhận diện thuật toán từ chính chuỗi hash.
   *
   * KHÔNG BAO GIỜ ném lỗi: một hash rác trong database phải dẫn tới "sai mật
   * khẩu", chứ không phải lỗi 500 làm lộ ra rằng bản ghi đó có vấn đề.
   */
  async verifyPassword(password: string, passwordHash: string): Promise<PasswordCheck> {
    if (isBcryptHash(passwordHash)) {
      const valid = await bcryptCompare(password, passwordHash).catch(() => false);
      return { valid, needsRehash: valid };
    }

    const valid = await argon2Verify(passwordHash, password).catch(() => false);

    return { valid, needsRehash: valid && !passwordHash.startsWith(CURRENT_HASH_PREFIX) };
  },

  /** Đốt lượng thời gian tương đương một lần kiểm tra thật. */
  async fakeCompare(password: string): Promise<void> {
    await argon2Verify(await getDummyHash(), password).catch(() => false);
  },
};
