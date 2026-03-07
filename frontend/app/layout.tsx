import type { Metadata } from "next";
import { Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import { AppProviders } from "@/components/providers";
import { Header } from "@/components/header";
import "@/styles/globals.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  weight: ["400", "500", "600", "700"]
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "700"]
});

export const metadata: Metadata = {
  title: "ShieldBet | Confidential Prediction Markets",
  description: "Prediction markets with encrypted positions. No front-running. True price discovery."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${bricolage.variable} ${mono.variable} min-h-screen`}>
        <AppProviders>
          <Header />
          <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6">{children}</main>
        </AppProviders>
      </body>
    </html>
  );
}
