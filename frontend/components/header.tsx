"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Lock, Shield } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

const navItems = [
  { href: "/markets", label: "Markets" },
  { href: "/my-bets", label: "My Bets" },
  { href: "/create", label: "Create Market" }
];

function truncateAddress(address?: string) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3 md:px-6">
        <Link href="/markets" className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500 text-white">
            <Shield className="h-4 w-4" />
          </span>
          <span className="text-lg font-semibold">ShieldBet</span>
          <Lock className="h-4 w-4 text-indigo-500" />
        </Link>

        <nav className="hidden items-center gap-2 md:flex">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <ConnectButton.Custom>
            {({ account, chain, mounted, openAccountModal, openChainModal, openConnectModal }) => {
              const ready = mounted;
              const connected = ready && account && chain;

              if (!connected) {
                return (
                  <button
                    type="button"
                    onClick={openConnectModal}
                    className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:scale-[1.02] hover:bg-indigo-600"
                  >
                    Connect Wallet
                  </button>
                );
              }

              return (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={openChainModal}
                    className="hidden rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300 md:inline-flex"
                  >
                    {chain.name}
                  </button>
                  <button
                    type="button"
                    onClick={openAccountModal}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:scale-[1.02] dark:bg-slate-100 dark:text-slate-900"
                  >
                    {truncateAddress(account.address)}
                  </button>
                </div>
              );
            }}
          </ConnectButton.Custom>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-7xl items-center gap-2 overflow-x-auto px-4 pb-3 md:hidden">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium ${
                active
                  ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300"
                  : "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </header>
  );
}
