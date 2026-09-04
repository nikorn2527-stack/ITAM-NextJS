import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/app/providers";
import { PwaRegistration } from "@/components/itam/pwa-registration";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "IT Asset Management",
  description:
    "ระบบจัดการสินทรัพย์ IT (ITAM) — จัดการอุปกรณ์, จดมิเตอร์, วิเคราะห์การใช้กระดาษ และตั้งค่าแอป",
  keywords: [
    "IT Asset Management",
    "ITAM",
    "Asset Tracking",
    "Next.js",
    "จัดการอุปกรณ์",
    "จดมิเตอร์",
  ],
  authors: [{ name: "ITAM" }],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "ITAM",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#f97316",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  // Bug fix: when keyboard opens on mobile, resize the viewport (not overlay)
  // so forms + buttons stay visible above the keyboard.
  // interactive-widget=resizes-content makes the layout viewport shrink
  // when the keyboard appears — no JS needed.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" suppressHydrationWarning>
      <head>
        {/* PWA — iOS standalone + safe-area aware */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="ITAM" />
        <meta name="format-detection" content="telephone=no" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <Providers>
          {children}
          <PwaRegistration />
        </Providers>
        <Toaster richColors position="top-right" />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
