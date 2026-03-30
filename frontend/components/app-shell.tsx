"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useBalance, useReadContract } from "wagmi";
import {
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Menu,
  Plus,
  Shield,
  Trophy,
  X,
  TrendingUp,
  Sparkles
} from "lucide-react";
// import { ThemeToggle } from "@/components/theme-toggle";
import { InteractiveLink } from "@/components/interactive-link";
import { shieldBetConfig } from "@/lib/contract";

const navItems = [
  { href: "/markets", label: "Markets", icon: LayoutGrid },
  { href: "/create", label: "Create Market", icon: Plus },
  { href: "/my-bets", label: "My Bets", icon: Trophy }
];

function truncateAddress(address?: string) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function ShellWalletButton({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <ConnectButton.Custom>
      {({ account, chain, mounted, openAccountModal, openChainModal, openConnectModal }) => {
        const connected = mounted && account && chain;

        if (!connected) {
          return (
            <button
              type="button"
              onClick={openConnectModal}
              className={`vm-wallet-btn w-full ${collapsed ? "justify-center px-0" : "justify-center"}`}
            >
              <Sparkles className="h-4 w-4" />
              {!collapsed ? <span>Connect Wallet</span> : null}
            </button>
          );
        }

        if (collapsed) {
          return (
            <button type="button" onClick={openAccountModal} className="vm-wallet-btn justify-center px-0">
              <span>{truncateAddress(account.address)}</span>
            </button>
          );
        }

        return (
          <div className="space-y-2">
            <button type="button" onClick={openChainModal} className="vm-chain-btn w-full justify-center">
              {chain.name}
            </button>
            <button type="button" onClick={openAccountModal} className="vm-wallet-btn w-full justify-center">
              {truncateAddress(account.address)}
            </button>
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}

function SidebarContent({ collapsed, onToggle, onNavigate }: { collapsed: boolean; onToggle: () => void; onNavigate?: () => void }) {
  const pathname = usePathname() ?? "";
  const { address } = useAccount();
  const { data: balance } = useBalance({ address });
  const { data: marketCount } = useReadContract({
    ...shieldBetConfig,
    functionName: "marketCount"
  });

  const stats = useMemo(
    () => ({
      marketCount: Number(marketCount || 0n),
      balanceLabel: balance ? `${Number(balance.formatted).toFixed(3)} ${balance.symbol}` : "Not connected"
    }),
    [balance, marketCount]
  );

  return (
    <div className={`vm-sidebar ${collapsed ? "is-collapsed" : ""} flex flex-col justify-between`}>
      <div>
        <div className="vm-sidebar__brand">
          <InteractiveLink href="/" className="vm-brand" pendingClassName="opacity-70" onClick={onNavigate}>
            <span className="vm-brand__mark">
              <Shield className="h-5 w-5" />
            </span>
            {!collapsed ? (
              <span className="min-w-0">
                <span className="vm-brand__title">ShieldBet</span>
                <span className="vm-brand__subtitle">Confidential markets</span>
              </span>
            ) : null}
          </InteractiveLink>
        </div>

        <nav className="vm-sidebar__nav">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <InteractiveLink
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                pendingClassName="opacity-80"
                className={`vm-sidebar__link ${active ? "is-active" : ""}`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {!collapsed ? <span>{item.label}</span> : null}
              </InteractiveLink>
            );
          })}
        </nav>
      </div>

      <div>
        {!collapsed ? (
          <div className="vm-sidebar__stats">
            <div className="vm-stats-card">
              <div className="vm-stats-card__head">
                <div className="vm-stats-card__icon">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <span>Network Pulse</span>
              </div>
              <div className="vm-stats-card__rows">
                <div className="vm-stats-card__row">
                  <span>Markets</span>
                  <strong>{stats.marketCount}</strong>
                </div>
                <div className="vm-stats-card__row">
                  <span>Wallet</span>
                  <strong>{stats.balanceLabel}</strong>
                </div>
                <div className="vm-stats-card__row">
                  <span>Privacy</span>
                  <strong>fhEVM + Lit</strong>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="vm-sidebar__footer">
          <div className={`flex items-center gap-2 ${collapsed ? "justify-center" : ""}`}>
            <ShellWalletButton collapsed={collapsed} />
            {/* {!collapsed ? <ThemeToggle /> : null} */}
          </div>
          <button type="button" onClick={onToggle} className="vm-collapse-btn">
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <><ChevronLeft className="h-4 w-4" /><span>Collapse</span></>}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isLanding = pathname === "/";

  if (isLanding) {
    return <>{children}</>;
  }

  return (
    <div className="vm-app-shell">
      <div className="noise-texture" />

      <div className="vm-mobile-bar">
        <InteractiveLink href="/" className="vm-brand" pendingClassName="opacity-70">
          <span className="vm-brand__mark">
            <Shield className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="vm-brand__title">ShieldBet</span>
            <span className="vm-brand__subtitle">Confidential markets</span>
          </span>
        </InteractiveLink>
        {/* <div className="flex items-center gap-2">
          <ThemeToggle />
          <button type="button" className="vm-mobile-menu-btn" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
        </div> */}
      </div>

      <div className="hidden lg:block">
        <SidebarContent collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} />
      </div>

      {mobileOpen ? (
        <div className="vm-mobile-overlay lg:hidden">
          <div className="vm-mobile-overlay__backdrop" onClick={() => setMobileOpen(false)} />
          <div className="vm-mobile-overlay__panel">
            <button type="button" className="vm-mobile-close" onClick={() => setMobileOpen(false)}>
              <X className="h-5 w-5" />
            </button>
            <SidebarContent collapsed={false} onToggle={() => setMobileOpen(false)} onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      ) : null}

      <main className={`vm-main ${collapsed ? "is-collapsed" : ""}`}>
        <div className="vm-main__inner">{children}</div>
      </main>
    </div>
  );
}
