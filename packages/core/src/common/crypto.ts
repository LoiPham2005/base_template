import argon2 from "argon2";

/**
 * Hash dùng cho phép so sánh giả, tính một lần rồi cache.
 *
 * Không có nó, nhánh "email không tồn tại" trả về gần như tức thì trong khi
 * nhánh "sai mật khẩu" tốn cả trăm mili-giây cho argon2. Chênh lệch đó đo được
 * từ bên ngoài, và kẻ tấn công dùng nó để dò xem email nào đã đăng ký.
 */
let dummyHashPromise: Promise<string> | null = null;

function getDummyHash(): Promise<string> {
  dummyHashPromise ??= argon2.hash("timing-attack-placeholder");
  return dummyHashPromise;
}

export class CryptoUtils {
  static async hashPassword(password: string): Promise<string> {
    return argon2.hash(password);
  }

  static async comparePassword(password: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  /** Đốt lượng thời gian tương đương một lần so sánh thật. */
  static async fakeCompare(password: string): Promise<void> {
    await CryptoUtils.comparePassword(password, await getDummyHash());
  }
}
