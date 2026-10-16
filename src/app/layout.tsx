import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "RecruitGPT.ai", template: "%s · RecruitGPT.ai" },
  description: "AI recruiting platform: source, score, brief and reach candidates, with a human approving every message.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
