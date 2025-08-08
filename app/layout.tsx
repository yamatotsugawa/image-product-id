import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "画像→商品情報（MVP）",
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="antialiased">
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
