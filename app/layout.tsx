import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "n8n AI Automation — Zero to Hero (Sync anonimo)",
  description: "Corso n8n completo con progressi sincronizzati senza account, pronto per Vercel.",
  viewport: "width=device-width, initial-scale=1",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
