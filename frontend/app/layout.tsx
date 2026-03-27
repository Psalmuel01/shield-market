import type { Metadata } from "next";
import { AppProviders } from "@/components/providers";
import { Header } from "@/components/header";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "ShieldBet | Confidential Prediction Markets",
  description: "Prediction markets with encrypted side selection and public ETH settlement for honest v1 operation."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen">
        <AppProviders>
          <Header />
          <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6">{children}</main>
        </AppProviders>
      </body>
    </html>
  );
}
