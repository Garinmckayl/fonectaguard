import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "FonectaGuard — Autonomous Business Presence Intelligence", description: "Connect once. Stay accurate everywhere." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
