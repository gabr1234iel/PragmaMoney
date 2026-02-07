import type { Metadata } from "next";
import "./globals.css";
import { Web3Provider } from "@/components/Web3Provider";
import { Navigation } from "@/components/Navigation";

export const metadata: Metadata = {
  title: "PragmaMoney - x402 Payment Gateway for AI Agents",
  description:
    "Decentralized payment infrastructure for AI agents and services using x402 protocol on Base",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-pragma-dark">
        <Web3Provider>
          <Navigation />
          <main className="min-h-[calc(100vh-4rem)]">{children}</main>
        </Web3Provider>
      </body>
    </html>
  );
}
