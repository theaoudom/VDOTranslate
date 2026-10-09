import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono, Noto_Sans_Khmer } from "next/font/google";
import "./globals.css";
import "@/presentation/samesay/samesay.css";
import { ToastProvider } from "@/presentation/samesay/Toast";
import { themeBootScript } from "@/presentation/samesay/ThemeToggle";

// Same families and weights as the confirmed prototype.
const archivo = Archivo({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-archivo", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-mono", display: "swap" });
const khmer = Noto_Sans_Khmer({ subsets: ["khmer"], weight: ["400", "600"], variable: "--font-khmer", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Samesay", template: "%s · Samesay" },
  description: "Translate any video and keep it sounding like the original: each speaker in their own voice, every line on time, ready to post.",
  icons: { icon: { url: "/favicon.svg", type: "image/svg+xml" } },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="light" className={`${archivo.variable} ${plexMono.variable} ${khmer.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
