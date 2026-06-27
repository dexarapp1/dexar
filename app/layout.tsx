import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  metadataBase: new URL("https://dexar.vercel.app"),
  title: "Dexar",
  description: "Dexar is a DEX aggregator on Arc Network. Swap, Send, and Bridge stablecoins with the best routes, AI-powered trading, and on-chain reputation scoring.",
  icons: {
    icon: "/dexar üst logo.png",
    apple: "/dexar üst logo.png",
  },
  openGraph: {
    title: "Dexar",
    description: "Dexar is a DEX aggregator on Arc Network. Swap, Send, and Bridge stablecoins with the best routes, AI-powered trading, and on-chain reputation scoring.",
    url: "https://dexar.vercel.app",
    siteName: "Dexar",
    images: [{ url: "/dexar.png", width: 512, height: 512, alt: "Dexar" }],
    type: "website",
  },
  twitter: {
    card: "summary",
    site: "@dexar_app",
    title: "Dexar",
    description: "Dexar is a DEX aggregator on Arc Network. Swap, Send, and Bridge stablecoins with the best routes, AI-powered trading, and on-chain reputation scoring.",
    images: ["/dexar.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
