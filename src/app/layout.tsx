import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Лента вдохновения — Gloria Jeans",
  description: "Визуальная лента товаров",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="antialiased min-h-screen">{children}</body>
    </html>
  );
}
