import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "AI Video Translator",
  description: "Seamlessly translate video speech using AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="antialiased font-sans">
        {/* Decorative background elements */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-brand-500/20 rounded-full blur-[120px] animate-pulse-slow" />
          <div className="absolute top-40 -left-40 w-80 h-80 bg-accent-500/10 rounded-full blur-[100px] animate-float" />
        </div>
        
        <main className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-8">
          <div className="w-full max-w-3xl">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
