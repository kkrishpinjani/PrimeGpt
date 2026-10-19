import "./globals.css";
import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";

const font = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const viewport = { width: "device-width", initialScale: 1 };

export const metadata: Metadata = {
  title: { default: "RecruitGPT.ai", template: "%s · RecruitGPT.ai" },
  description: "AI recruiting platform: source, score, brief and reach candidates, with a human approving every message.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={font.variable}>
      <body>{children}</body>
    </html>
  );
}
