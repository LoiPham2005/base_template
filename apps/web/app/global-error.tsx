"use client";

/**
 * Lưới an toàn CUỐI CÙNG: lỗi xảy ra trong chính `layout.tsx`.
 *
 * `error.tsx` nằm BÊN TRONG layout, nên nó không bắt được lỗi của chính layout
 * — lúc đó React không có gì để render và người dùng nhận một trang trắng
 * tuyệt đối.
 *
 * Vì layout gốc đã hỏng, file này phải tự dựng lại `<html>` và `<body>`, và
 * KHÔNG được dựa vào CSS nào (biết đâu chính nó là thứ hỏng) — nên dùng style
 * nội tuyến. Đây là ngoại lệ DUY NHẤT của luật "chỉ dùng Tailwind".
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="vi">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          maxWidth: 480,
          margin: "80px auto",
          padding: "0 24px",
        }}
      >
        <h1 style={{ fontSize: 20 }}>Không tải được ứng dụng</h1>
        <p style={{ color: "#475569" }}>
          Đã có sự cố nghiêm trọng. Bạn thử tải lại trang giúp nhé.
        </p>
        <button type="button" onClick={reset} style={{ padding: "8px 16px", marginTop: 8 }}>
          Tải lại
        </button>
      </body>
    </html>
  );
}
