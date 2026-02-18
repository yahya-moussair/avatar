import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ada Lovelace — Voice Avatar",
  description: "Speak with Ada Lovelace, the world's first computer programmer",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}