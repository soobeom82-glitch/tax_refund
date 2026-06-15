import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tax Refund Intake",
  description: "Telegram intake and ledger storage for VAT evidence and bank transactions.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
