import type { PrismaClient } from "@repo/db";
import { isKnownPermission, type Permission } from "@repo/contracts";
import { cacheDelByPrefix, cacheGet, cacheSet } from "../infra/cache";

/**
 * Trả lời câu hỏi "người này được làm gì", đọc từ database, có cache.
 *
 * ---
 * QUYỀN HIỆU LỰC ĐƯỢC TÍNH THẾ NÀO
 *
 *   1. HỢP của quyền đến từ MỌI vai trò người đó đang mang.
 *   2. Cộng thêm các `UserPermission` có `isGranted = true`.
 *   3. TRỪ đi các `UserPermission` có `isGranted = false`.
 *
 * Thứ tự quan trọng: bước 3 chạy SAU CÙNG, nên "tước quyền" luôn thắng. Cần
 * chặn gấp một người khỏi một hành động thì phải chặn được ngay, không phải đi
 * gỡ họ khỏi vai trò rồi dựng lại một vai trò gần giống.
 *
 * ---
 * VÌ SAO CACHE THEO NGƯỜI DÙNG, KHÔNG PHẢI THEO VAI TRÒ
 *
 * Vì có `UserPermission`: hai người cùng vai trò vẫn có thể khác quyền. Cache
 * theo vai trò sẽ bỏ sót đúng phần ngoại lệ — mà ngoại lệ mới là thứ người ta
 * đặt ra khi có việc gấp.
 *
 * ---
 * HAI GIỚI HẠN PHẢI BIẾT
 *
 * 1. Không có Redis thì cache nằm trong RAM của MỘT tiến trình, và
 *    `invalidateUser()` chỉ xoá bản sao của tiến trình đang xử lý request đó.
 *    Đây là lý do vẫn có TTL: tiến trình khác tự làm mới sau `CACHE_TTL`.
 *    Có `REDIS_URL` thì cache dùng chung và xoá là xoá thật cho mọi instance.
 *
 * 2. Quyền LUÔN được tra lại từ đây, KHÔNG BAO GIỜ đọc từ JWT. Ký quyền vào
 *    token nghĩa là sửa phân quyền không có tác dụng cho tới khi token hết hạn
 *    — người vừa bị tước quyền vẫn thao tác được thêm 15 phút nữa.
 */

/**
 * Một phút: đủ ngắn để thay đổi phân quyền lan ra nhanh, đủ dài để chặn gần
 * như toàn bộ truy vấn lặp lại trên đường đi nóng.
 *
 * Cũng là ĐỘ TRỄ TỐI ĐA của việc hết hạn quyền tạm (`UserPermission.expiresAt`):
 * một quyền hết hạn lúc 10:00 có thể còn dùng được tới 10:01. Chấp nhận được
 * với "cấp quyền trong 24 giờ"; nếu dự án của bạn cần chính xác tới giây thì
 * hạ TTL xuống — cái giá là nhiều truy vấn hơn.
 */
const CACHE_TTL_SECONDS = 60;

/** Đổi tiền tố này khi đổi hình dạng dữ liệu cache, nếu không bản deploy mới đọc phải giá trị cũ. */
const CACHE_PREFIX = "perm:v1:";

export class PermissionService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Xoá cache của MỘT người. Gọi sau khi đổi vai trò hoặc quyền riêng của họ.
   */
  async invalidateUser(userId: string): Promise<void> {
    await cacheDelByPrefix(`${CACHE_PREFIX}${userId}`);
  }

  /**
   * Xoá cache của TẤT CẢ. Gọi sau khi sửa bảng phân quyền của một vai trò —
   * lúc đó không biết được ai đang mang vai trò đó mà không truy vấn thêm, và
   * thao tác này hiếm tới mức không đáng tối ưu.
   */
  async invalidateAll(): Promise<void> {
    await cacheDelByPrefix(CACHE_PREFIX);
  }

  private async load(userId: string): Promise<Permission[]> {
    const user = await this.db.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        userRoles: {
          select: {
            role: {
              select: { permissions: { select: { permission: { select: { key: true } } } } },
            },
          },
        },
        userPermissions: {
          // Bỏ qua ngoại lệ ĐÃ HẾT HẠN ngay trong truy vấn.
          //
          // Lọc ở tầng ứng dụng cũng được, nhưng lọc ở đây thì không có đường
          // nào quên: mọi nơi hỏi "người này có quyền gì" đều đi qua đúng câu
          // truy vấn này. Một quyền tạm mà vẫn còn hiệu lực sau khi hết hạn là
          // đúng thứ mà cột `expiresAt` sinh ra để ngăn.
          where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
          select: { isGranted: true, permission: { select: { key: true } } },
        },
      },
    });

    if (!user) return [];

    const granted = new Set<Permission>();

    for (const { role } of user.userRoles) {
      for (const { permission } of role.permissions) {
        // Bỏ qua bản ghi còn sót của quyền đã bị xoá khỏi code. Không có bước
        // này, một dòng cũ trong database vẫn cấp được quyền mà không dòng mã
        // nào còn kiểm tra nó.
        if (isKnownPermission(permission.key)) granted.add(permission.key);
      }
    }

    // Cấp thêm trước, tước sau — thứ tự quyết định: tước luôn thắng.
    for (const item of user.userPermissions) {
      if (item.isGranted && isKnownPermission(item.permission.key)) {
        granted.add(item.permission.key);
      }
    }
    for (const item of user.userPermissions) {
      if (!item.isGranted) granted.delete(item.permission.key as Permission);
    }

    return [...granted];
  }

  /** Toàn bộ quyền hiệu lực của một người. */
  async permissionsFor(userId: string): Promise<ReadonlySet<Permission>> {
    const key = `${CACHE_PREFIX}${userId}`;

    const cachedList = await cacheGet<Permission[]>(key);
    if (cachedList) return new Set(cachedList);

    const list = await this.load(userId);
    await cacheSet(key, list, CACHE_TTL_SECONDS);

    return new Set(list);
  }

  async can(userId: string, permission: Permission): Promise<boolean> {
    return (await this.permissionsFor(userId)).has(permission);
  }

  /** Đúng khi có ÍT NHẤT MỘT trong các quyền được liệt kê. */
  async canAny(userId: string, permissions: readonly Permission[]): Promise<boolean> {
    const granted = await this.permissionsFor(userId);
    return permissions.some((permission) => granted.has(permission));
  }

  /** Đúng khi có ĐỦ TẤT CẢ các quyền được liệt kê. */
  async canAll(userId: string, permissions: readonly Permission[]): Promise<boolean> {
    const granted = await this.permissionsFor(userId);
    return permissions.every((permission) => granted.has(permission));
  }

  /**
   * Kiểm tra quyền trên một tài nguyên cụ thể, có xét quyền `:own`.
   *
   * Ví dụ: ADMIN đọc được hồ sơ của bất kỳ ai, còn USER chỉ đọc được hồ sơ của
   * chính mình. Gói luật đó vào một chỗ để nó không bị chép lại — và chép sai —
   * ở từng controller.
   *
   * @example
   * await permissions.canActOnResource(actorId, ownerId, {
   *   any: "user:update",
   *   own: "profile:update:own",
   * });
   */
  async canActOnResource(
    actorId: string,
    ownerId: string,
    permissions: { any: Permission; own: Permission },
  ): Promise<boolean> {
    const granted = await this.permissionsFor(actorId);

    if (granted.has(permissions.any)) return true;
    return ownerId === actorId && granted.has(permissions.own);
  }
}
