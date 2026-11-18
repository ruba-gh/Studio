import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "شركاء ستوديو ربى",
  description: "لوحة إدارة وتتبع العمولات والإحالات لستوديو ربى",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ar" dir="rtl"><body>{children}</body></html>;
}
