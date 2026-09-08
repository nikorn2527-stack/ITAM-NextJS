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
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                if (!('serviceWorker' in navigator)) return;
                // In dev mode, aggressively clean up any SW + caches.
                // (Production mode: leave SW alone so offline cache works.)
                var isDev = ${process.env.NODE_ENV === 'development' ? 'true' : 'false'};
                if (!isDev) return;
                window.addEventListener('load', function() {
                  navigator.serviceWorker.getRegistrations().then(function(regs) {
                    if (regs.length === 0) return;
                    console.info('[EarlySW] dev mode — unregistering ' + regs.length + ' stale SW(s)');
                    return Promise.all(regs.map(function(r) { return r.unregister(); }));
                  }).then(function() {
                    if ('caches' in window) {
                      return caches.keys().then(function(keys) {
                        if (keys.length === 0) return;
                        console.info('[EarlySW] clearing ' + keys.length + ' cache(s)');
                        return Promise.all(keys.map(function(k) { return caches.delete(k); }));
                      });
                    }
                  }).then(function() {
                    // Reload once to ensure SW is fully gone before chunks load.
                    var flag = 'itam.early-sw-cleaned';
                    if (!sessionStorage.getItem(flag)) {
                      sessionStorage.setItem(flag, '1');
                      window.location.reload();
                    } else {
                      sessionStorage.removeItem(flag);
                    }
                  }).catch(function(e) {
                    console.warn('[EarlySW] cleanup failed:', e);
                  });
                });
                // ── CHUNK LOAD ERROR AUTO-RECOVERY ──
                // Even after SW cleanup, the browser may still have stale
                // chunks in HTTP cache. Catch chunk load errors and reload
                // once with cache-busting.
                window.addEventListener('error', function(e) {
                  var msg = (e.message || '') + ' ' + (e.error && e.error.message || '');
                  if (/module factory is not available|ChunkLoadError|Failed to fetch dynamically imported module|Loading chunk \\d+ failed/i.test(msg)) {
                    var flag = 'itam.auto-reloaded-at';
                    var last = parseInt(sessionStorage.getItem(flag) || '0', 10);
                    if (Date.now() - last > 60000) { // 1 min cooldown
                      sessionStorage.setItem(flag, String(Date.now()));
                      var url = new URL(window.location.href);
                      url.searchParams.set('_r', String(Date.now()));
                      window.location.replace(url.toString());
                    }
                  }
                });
              })();
            `,
          }}
        />
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
