import argon2 from "argon2";

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
}
