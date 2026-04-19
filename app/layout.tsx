import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Flight & Duty Log",
  description: "Part 135 style flight and duty tracking app",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
