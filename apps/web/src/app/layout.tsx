import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "BPredict — 莊閒 · BTC 漲跌",
  description: "百家樂節奏的 BTC 漲跌預測遊戲。虛擬金幣，純娛樂。",
};

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
    <html lang="zh-Hant" suppressHydrationWarning>
      <head>
        <Script src="https://telegram.org/js/telegram-web-app.js?57" strategy="beforeInteractive" />
      </head>
      <body className={`min-h-full antialiased ${isUat ? "test-watermark" : ""}`}>
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
