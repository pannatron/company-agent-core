import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Virtual AI Company",
  description: "บริษัทเสมือนที่จำลองพนักงานทุกแผนกเป็น AI agent",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
