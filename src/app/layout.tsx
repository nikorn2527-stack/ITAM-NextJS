import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/app/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "IT Asset Management — PNG TEAM",
  description:
    "ระบบจัดการอุปกรณ์ IT (ITAM) — สำหรับ PNG TEAM. จัดการอุปกรณ์, จดมิเตอร์, วิเคราะห์การใช้กระดาษ และตั้งค่าแอป",
  keywords: [
    "IT Asset Management",
    "ITAM",
    "PNG TEAM",
    "Next.js",
    "จัดการอุปกรณ์",
  ],
  authors: [{ name: "PNG TEAM" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <Providers>{children}</Providers>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
