import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "BPredict — BTC 漲跌預測",
  description: "5 分鐘一回合的 BTC 漲跌預測遊戲。虛擬金幣，純娛樂。",
};

/** Runs before first paint: applies the stored UI mode so fresh-mode users never flash the casino theme. */
const MODE_BOOT = `try{var m=localStorage.getItem("bp.mode");if(m==="fresh"||m==="casino"){document.documentElement.dataset.mode=m;var t=document.querySelector('meta[name="theme-color"]');if(t)t.content=m==="fresh"?"#F4F6FA":"#071F18";}}catch(e){}`;

export const viewport: Viewport = {
  themeColor: "#0B3D2E",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

const isUat = process.env.NEXT_PUBLIC_APP_ENV === "uat";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant" data-mode="casino" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: MODE_BOOT }} />
        <Script src="https://telegram.org/js/telegram-web-app.js?57" strategy="beforeInteractive" />
      </head>
      <body className={`min-h-full antialiased ${isUat ? "test-watermark" : ""}`}>
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
