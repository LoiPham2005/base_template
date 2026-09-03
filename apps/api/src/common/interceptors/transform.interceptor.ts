import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { map, type Observable } from "rxjs";

/**
 * Bọc mọi response thành công vào `{ data: … }`.
 *
 * ---
 * VÌ SAO CẦN MỘT VỎ BỌC
 *
 * Không có nó thì `GET /users` trả về một mảng trần, còn `GET /users/:id` trả
 * về một object trần — và client không có chỗ nào để thêm metadata (phân trang,
 * cảnh báo, phiên bản) mà không phá vỡ tương thích.
 *
 * Hình dạng thống nhất: thành công là `{ data }`, thất bại là `{ error }`
 * (xem `AllExceptionsFilter`). Client kiểm tra sự tồn tại của một trong hai —
 * không phải đoán theo mã HTTP.
 *
 * ---
 * KHÔNG BỌC HAI LẦN
 *
 * Controller trả sẵn `{ data }` (hiếm, nhưng xảy ra khi chuyển tiếp response
 * từ nơi khác) sẽ không bị bọc thêm lần nữa.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, { data: T }> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<{ data: T }> {
    return next.handle().pipe(
      map((payload) => {
        if (payload !== null && typeof payload === "object" && "data" in payload) {
          return payload as unknown as { data: T };
        }
        return { data: payload };
      }),
    );
  }
}
