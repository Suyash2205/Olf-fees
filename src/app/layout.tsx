import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import SessionProvider from "@/components/SessionProvider";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });

export const metadata: Metadata = {
  title: "Our Lady of Fatima School — Admin Portal",
  description:
    "Admission and fees management portal for Our Lady of Fatima School (OLF High School)",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full overflow-x-hidden">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
