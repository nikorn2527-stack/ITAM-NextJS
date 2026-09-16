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
        {/* ── EARLY SW + CACHE CLEANUP (runs before React) ──────────────
            This script MUST run before any chunk loads. If a stale service
            worker (from a previous production visit) is intercepting
            requests, it will serve stale chunks that crash with
            "module factory is not available". We unregister + clear caches
            here, then force a clean reload if anything was found. */}
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {/* SPRINT-FIX: Removed next/script <Script> tag because React 19 /
            Next.js 16 rejects it with "Encountered a script tag while
            rendering React component" error that crashes the page.

            The SW cleanup logic has been moved to a client-side useEffect
            in pwa-registration.tsx (which already handles SW lifecycle).

            The chunk-load error auto-recovery is handled by the browser's
            native error event listener registered in Providers. */}
        <Providers>
          {children}
          <PwaRegistration />
        </Providers>
        <Toaster richColors position="top-right" />
        {/* Analytics/SpeedInsights render a <script> element that React 19
            flags in dev mode ("Encountered a script tag while rendering
            React component"). They no-op in dev anyway (debug mode, no
            requests sent), so only mount them in production to keep the
            dev console clean for QA. Known upstream issue:
            vercel/analytics#xxx with React 19. */}
        {process.env.NODE_ENV === "production" && (
          <>
            <Analytics />
            <SpeedInsights />
          </>
        )}
      </body>
    </html>
  );
}
