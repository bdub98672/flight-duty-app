import "./globals.css";

export const metadata = {
  title: "Flight Duty Log",
  description: "Deployable Next.js + Supabase flight and duty log",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
