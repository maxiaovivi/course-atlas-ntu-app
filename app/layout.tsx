import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "知屿 · Course Atlas",
  description: "A shared ocean-blue course library with an immersive document reader.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
