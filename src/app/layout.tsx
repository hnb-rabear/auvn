import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vùng Vàng — trợ lý vùng mua/bán vàng",
  description:
    "Phân tích xác suất vùng mua / vùng bán vàng SJC & nhẫn theo nhiều tiêu chí, có kiểm chứng lịch sử. Công cụ hỗ trợ quyết định, không phải khuyến nghị đầu tư.",
  manifest: "manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#0e0c08",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
