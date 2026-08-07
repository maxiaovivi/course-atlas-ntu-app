import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "知屿 · Course Atlas",
  description: "A private course library for a small circle of learners.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
