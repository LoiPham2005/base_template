import { BadRequestException, Body, Controller, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { createPresignedUpload, isStorageConfigured } from "@repo/core";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { RateLimit } from "../common/decorators/rate-limit.decorator";

/**
 * Loại tệp được phép, và giới hạn kích thước gợi ý cho client.
 *
 * Danh sách TRẮNG chứ không phải danh sách đen: liệt kê thứ bị cấm thì luôn sót,
 * và một tệp `.html` upload lên bucket công khai biến tên miền của bạn thành nơi
 * lưu trữ trang lừa đảo.
 *
 * ⚠️ `contentType` được KÝ VÀO presigned URL, nên client gửi header khác là S3
 * từ chối. Đó là thứ làm cho danh sách này có hiệu lực thật, chứ không chỉ là
 * một phép kiểm tra trên giấy.
 */
const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

const presignSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.enum(ALLOWED_CONTENT_TYPES, {
    errorMap: () => ({ message: `Chỉ chấp nhận: ${ALLOWED_CONTENT_TYPES.join(", ")}` }),
  }),
  /**
   * Thư mục logic trong bucket: "avatars", "documents", "products"…
   *
   * Được làm sạch trong `buildObjectKey` — client KHÔNG tự đặt được đường dẫn
   * đầy đủ, nếu không thì `../` là đường thoát ra khỏi thư mục dự định.
   */
  prefix: z
    .string()
    .regex(/^[a-z0-9_-]+$/, "prefix chỉ gồm chữ thường, số, _ và -")
    .default("uploads"),
});

export class PresignUploadDto extends createZodDto(presignSchema) {}

/**
 * Tải tệp lên bằng presigned URL.
 *
 * API KHÔNG nhận byte nào: client xin một đường dẫn có hạn rồi `PUT` thẳng lên
 * S3. Xem ghi chú đầu `infra/storage.ts` để hiểu vì sao — tóm tắt: nhận file
 * qua API buộc phải nới `bodyLimit` cho MỌI endpoint, kể cả `/auth/login`.
 */
@ApiTags("files")
@ApiBearerAuth()
@Controller("files")
export class FilesController {
  @Post("presign")
  @RequirePermissions("file:upload")
  @RateLimit("upload")
  @ApiOperation({ summary: "Xin link tải tệp lên (client PUT thẳng lên S3)" })
  async presign(@Body() dto: PresignUploadDto) {
    if (!isStorageConfigured()) {
      throw new BadRequestException(
        "Kho tệp chưa được cấu hình. Đặt S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY trong .env.",
      );
    }

    return createPresignedUpload({
      prefix: dto.prefix,
      fileName: dto.fileName,
      contentType: dto.contentType,
    });
  }
}
