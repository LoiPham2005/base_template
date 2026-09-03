import { randomUUID } from "node:crypto";
import { env } from "../config/env";
import { logger } from "../common/logger";

/**
 * Kho tệp trên S3 (hoặc bất cứ thứ gì nói giao thức S3: MinIO, Cloudflare R2,
 * Vietnix, Bizfly…).
 *
 * ---
 * VÌ SAO DÙNG PRESIGNED URL CHỨ KHÔNG NHẬN FILE QUA API
 *
 * Nhận file qua API nghĩa là mọi byte đi qua tiến trình Node: một người upload
 * video 200MB là 200MB đi qua RAM và băng thông của server, nhân với số người
 * upload cùng lúc. Thêm nữa, Fastify/Nest phải cấu hình `bodyLimit` lớn — mà
 * giới hạn đó áp cho MỌI endpoint, kể cả `/auth/login`.
 *
 * Presigned URL đảo ngược việc đó: API chỉ ký một đường dẫn có hạn (vài phút),
 * client PUT thẳng lên S3. Server không chạm vào byte nào.
 *
 * ---
 * KHÔNG CẤU HÌNH S3 THÌ SAO
 *
 * `isStorageConfigured()` trả `false` và các hàm ném lỗi rõ ràng. Cố ý KHÔNG
 * có bản "lưu vào thư mục local": nó chạy được trên máy dev rồi hỏng ngay khi
 * lên nhiều instance (mỗi instance một ổ đĩa riêng), và hỏng theo kiểu file
 * "thỉnh thoảng mới 404" — rất tốn thời gian để lần ra.
 */

export type PresignedUpload = {
  /** Client PUT thẳng vào đây. Có hạn — xem `expiresIn`. */
  uploadUrl: string;
  /** Đường dẫn tệp trong bucket. Đây mới là thứ nên lưu vào database. */
  key: string;
  /** URL đọc được công khai (nếu bucket/CDN cho phép). */
  publicUrl: string;
  expiresIn: number;
};

export function isStorageConfigured(): boolean {
  return Boolean(env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY);
}

function requireConfig() {
  if (!isStorageConfigured()) {
    throw new Error(
      "Kho tệp chưa được cấu hình. Cần S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY " +
        "(và S3_ENDPOINT nếu không dùng AWS).",
    );
  }

  return {
    bucket: env.S3_BUCKET!,
    accessKeyId: env.S3_ACCESS_KEY_ID!,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
  };
}

type S3Client = import("@aws-sdk/client-s3").S3Client;

let clientPromise: Promise<S3Client> | null = null;

async function getClient(): Promise<S3Client> {
  const config = requireConfig();

  clientPromise ??= (async () => {
    // Import động: SDK của AWS rất nặng, dự án không dùng kho tệp thì không
    // phải nạp nó.
    const { S3Client } = await import("@aws-sdk/client-s3");

    logger.info("Storage: dùng S3", { endpoint: env.S3_ENDPOINT ?? "aws", bucket: config.bucket });

    return new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      // MinIO và một số nhà cung cấp trong nước đặt bucket trong ĐƯỜNG DẪN
      // (`https://host/bucket/key`) thay vì trong tên miền con. Đặt sai cờ này
      // thì mọi request trả 404 hoặc NoSuchBucket.
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  })();

  return clientPromise;
}

/**
 * Dựng key an toàn: `<prefix>/<yyyy>/<mm>/<uuid>.<ext>`.
 *
 * KHÔNG dùng tên file gốc do client gửi. Hai lý do: nó chứa được `../` (đường
 * thoát khỏi thư mục), và hai người upload cùng tên là ghi đè lên nhau. Tên
 * hiển thị cho người dùng thì lưu riêng trong database.
 */
export function buildObjectKey(prefix: string, originalName: string): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");

  const extension = originalName.includes(".")
    ? `.${originalName
        .split(".")
        .pop()!
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 10)}`
    : "";

  const safePrefix = prefix.replace(/[^a-zA-Z0-9/_-]/g, "").replace(/^\/+|\/+$/g, "");

  return `${safePrefix}/${year}/${month}/${randomUUID()}${extension}`;
}

export function publicUrlFor(key: string): string {
  if (env.S3_PUBLIC_URL) return `${env.S3_PUBLIC_URL.replace(/\/+$/, "")}/${key}`;
  if (env.S3_ENDPOINT) return `${env.S3_ENDPOINT.replace(/\/+$/, "")}/${env.S3_BUCKET}/${key}`;
  return `https://${env.S3_BUCKET}.s3.${env.S3_REGION}.amazonaws.com/${key}`;
}

/**
 * Ký một đường dẫn để client PUT tệp lên.
 *
 * `contentType` được ký VÀO chữ ký: client gửi header khác là S3 từ chối. Đây
 * là thứ ngăn "xin link cho ảnh, upload lên một file HTML" — vốn biến bucket
 * của bạn thành nơi lưu trữ trang lừa đảo dưới tên miền của chính bạn.
 */
export async function createPresignedUpload(options: {
  prefix: string;
  fileName: string;
  contentType: string;
  /** Hạn của link, tính bằng giây. Ngắn thôi — client dùng ngay sau khi xin. */
  expiresIn?: number;
}): Promise<PresignedUpload> {
  const config = requireConfig();
  const [{ PutObjectCommand }, { getSignedUrl }] = await Promise.all([
    import("@aws-sdk/client-s3"),
    import("@aws-sdk/s3-request-presigner"),
  ]);

  const key = buildObjectKey(options.prefix, options.fileName);
  const expiresIn = options.expiresIn ?? 300;

  const uploadUrl = await getSignedUrl(
    await getClient(),
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      ContentType: options.contentType,
    }),
    { expiresIn },
  );

  return { uploadUrl, key, publicUrl: publicUrlFor(key), expiresIn };
}

/**
 * Ký đường dẫn ĐỌC cho tệp riêng tư (bucket không public).
 *
 * Dùng cho tài liệu cá nhân: hợp đồng, CMND, hoá đơn. Với ảnh đại diện công
 * khai thì `publicUrlFor` rẻ hơn nhiều — không phải ký gì cả và CDN cache được.
 */
export async function createPresignedDownload(key: string, expiresIn = 300): Promise<string> {
  const config = requireConfig();
  const [{ GetObjectCommand }, { getSignedUrl }] = await Promise.all([
    import("@aws-sdk/client-s3"),
    import("@aws-sdk/s3-request-presigner"),
  ]);

  return getSignedUrl(
    await getClient(),
    new GetObjectCommand({ Bucket: config.bucket, Key: key }),
    { expiresIn },
  );
}

export async function deleteObject(key: string): Promise<void> {
  const config = requireConfig();
  const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await getClient();
  await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
}
