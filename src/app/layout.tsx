import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ErrorBoundary } from "@/components/error-boundary";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "کوینکس تریدر هوش مصنوعی - AI-Powered Trading Bot",
  description: "اپلیکیشن تریدر هوش مصنوعی برای صرافی کوینکس با استراتژی SuperTrend و قابلیت‌های پیشرفته معاملاتی",
  keywords: ["کوینکس", "تریدر", "هوش مصنوعی", "SuperTrend", "معامله", "ارز دیجیتال", "ربات تریدر"],
  authors: [{ name: "Z.ai Team" }],
  openGraph: {
    title: "کوینکس تریدر هوش مصنوعی",
    description: "اپلیکیشن تریدر هوش مصنوعی برای صرافی کوینکس",
    url: "https://chat.z.ai",
    siteName: "Z.ai",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "کوینکس تریدر هوش مصنوعی",
    description: "اپلیکیشن تریدر هوش مصنوعی برای صرافی کوینکس",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
        <Toaster />
      </body>
    </html>
  );
}
