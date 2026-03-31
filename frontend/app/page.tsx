"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  ArrowRight,
  CheckCircle2,
  EyeOff,
  Gavel,
  Lock,
  Shield,
  Sparkles,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { InteractiveLink } from "@/components/interactive-link";

// ── Ticker ─────────────────────────────────────────────────────────────────────
const TICKER = [
  { label: "ETH > $6k by Dec 2026", state: "ENCRYPTED" },
  { label: "BTC dominance > 60%", state: "OPEN" },
  { label: "Solana ETF approved", state: "ENCRYPTED" },
  { label: "US rates cut before Q4", state: "OPEN" },
  { label: "AI regulation passes Senate", state: "ENCRYPTED" },
  { label: "Nigeria digital bond launch", state: "OPEN" },
];

function Ticker() {
  const doubled = [...TICKER, ...TICKER];
  return (
    <div className="sb-ticker">
      <div className="sb-ticker-inner">
        {doubled.map((item, i) => (
          <span key={i} className="sb-ticker-item">
            <span className={`sb-ticker-dot ${item.state === "ENCRYPTED" ? "enc" : "open"}`} />
            <span className="sb-ticker-label">{item.label}</span>
            <span className={`sb-ticker-state ${item.state === "ENCRYPTED" ? "enc" : "open"}`}>
              {item.state}
            </span>
            <span className="sb-ticker-divider">·</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Glitch text ────────────────────────────────────────────────────────────────
function GlitchWord({ children }: { children: string }) {
  return (
    <span className="sb-glitch" data-text={children}>
      {children}
    </span>
  );
}

// ── Animated counter ───────────────────────────────────────────────────────────
function Counter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        obs.disconnect();
        let start = 0;
        const step = target / 40;
        const timer = setInterval(() => {
          start = Math.min(start + step, target);
          setVal(Math.floor(start));
          if (start >= target) clearInterval(timer);
        }, 30);
      },
      { threshold: 0.4 }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [target]);
  return (
    <span ref={ref}>
      {val.toLocaleString()}
      {suffix}
    </span>
  );
}

// ── Wallet button ──────────────────────────────────────────────────────────────
function LandingWalletButton() {
  return (
    <ConnectButton.Custom>
      {({ mounted, account, chain, openConnectModal, openAccountModal }) => {
        const connected = mounted && account && chain;
        return (
          <button
            type="button"
            onClick={connected ? openAccountModal : openConnectModal}
            className="sb-nav-cta"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {connected
              ? `${account!.address.slice(0, 6)}…${account!.address.slice(-4)}`
              : "Connect"}
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function Home() {
  return (
    <>
      <style>{`
        /* ── Reset & tokens ── */
        :root {
          --bg: #04070f;
          --surface: #080d18;
          --surface2: #0c1220;
          --border: rgba(255,255,255,0.07);
          --border-accent: rgba(0,228,180,0.22);
          --teal: #00e4b4;
          --teal-dim: rgba(0,228,180,0.55);
          --blue: #6c8eff;
          --text: #eef1f8;
          --muted: rgba(238,241,248,0.55);
          --dim: rgba(238,241,248,0.28);
          --mono: 'JetBrains Mono', monospace;
          --display: 'Bricolage Grotesque', sans-serif;
          --body: 'Bricolage Grotesque', sans-serif;
        }

        .sb-root {
          background: var(--bg);
          color: var(--text);
          font-family: var(--body);
          min-height: 100vh;
          overflow-x: hidden;
          position: relative;
        }

        /* ── Noise texture ── */
        .sb-root::before {
          content: '';
          position: fixed;
          inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
          pointer-events: none;
          z-index: 0;
          opacity: 0.35;
        }

        /* ── Grid ── */
        .sb-grid-bg {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          background-image:
            linear-gradient(rgba(0,228,180,0.035) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,228,180,0.035) 1px, transparent 1px);
          background-size: 52px 52px;
          mask-image: linear-gradient(to bottom, black 0%, transparent 75%);
        }

        /* ── Radial glows ── */
        .sb-glow-a {
          position: fixed;
          top: -15vw;
          left: -10vw;
          width: 55vw;
          height: 55vw;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(0,228,180,0.07) 0%, transparent 65%);
          pointer-events: none;
          z-index: 0;
        }
        .sb-glow-b {
          position: fixed;
          top: -10vw;
          right: -15vw;
          width: 50vw;
          height: 50vw;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(108,142,255,0.065) 0%, transparent 60%);
          pointer-events: none;
          z-index: 0;
        }

        /* ── Layer wrapper ── */
        .sb-wrap {
          position: relative;
          z-index: 1;
          max-width: 1280px;
          margin: 0 auto;
          padding: 0 24px 40px;
        }

        /* ── Nav ── */
        .sb-nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 0 0;
          margin-bottom: 2px;
        }
        .sb-logo {
          display: flex;
          align-items: center;
          gap: 14px;
          text-decoration: none;
        }
        .sb-logo-mark {
          width: 44px; height: 44px;
          border-radius: 14px;
          background: linear-gradient(135deg, var(--teal), var(--blue));
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          box-shadow: 0 0 32px rgba(0,228,180,0.22);
        }
        .sb-logo-name {
          font-family: var(--display);
          font-size: 18px;
          font-weight: 800;
          color: var(--text);
          letter-spacing: -0.02em;
        }
        .sb-logo-tag {
          font-family: var(--mono);
          font-size: 10px;
          color: var(--dim);
          letter-spacing: 0.14em;
          text-transform: uppercase;
          margin-top: 2px;
        }
        .sb-nav-links {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .sb-nav-link {
          padding: 8px 16px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 600;
          color: var(--muted);
          text-decoration: none;
          transition: color 0.2s, background 0.2s;
        }
        .sb-nav-link:hover { color: var(--text); background: rgba(255,255,255,0.05); }
        .sb-nav-cta {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 9px 20px;
          border-radius: 10px;
          border: 1px solid var(--border-accent);
          background: rgba(0,228,180,0.08);
          color: var(--teal);
          font-size: 13px;
          font-weight: 700;
          font-family: var(--mono);
          cursor: pointer;
          transition: background 0.2s, box-shadow 0.2s;
        }
        .sb-nav-cta:hover {
          background: rgba(0,228,180,0.14);
          box-shadow: 0 0 20px rgba(0,228,180,0.15);
        }

        /* ── Ticker ── */
        .sb-ticker {
          overflow: hidden;
          border-top: 1px solid var(--border);
          border-bottom: 1px solid var(--border);
          background: var(--surface);
          padding: 10px 0;
          margin-bottom: 7px;
        }
        @keyframes ticker { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        .sb-ticker-inner {
          display: inline-flex;
          animation: ticker 32s linear infinite;
          white-space: nowrap;
        }
        .sb-ticker-item {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 0 24px;
          font-family: var(--mono);
          font-size: 11px;
        }
        .sb-ticker-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .sb-ticker-dot.enc { background: var(--teal); }
        .sb-ticker-dot.open { background: var(--blue); }
        .sb-ticker-label { color: var(--muted); }
        .sb-ticker-state { font-weight: 700; letter-spacing: 0.1em; }
        .sb-ticker-state.enc { color: var(--teal); }
        .sb-ticker-state.open { color: var(--blue); }
        .sb-ticker-divider { color: var(--dim); font-size: 16px; margin-left: 8px; }

        /* ── Hero ── */
        .sb-hero {
          display: grid;
          grid-template-columns: 1.1fr 0.9fr;
          gap: 64px;
          align-items: start;
          margin-bottom: 88px;
        }
        .sb-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 14px;
          border-radius: 100px;
          border: 1px solid var(--border-accent);
          background: rgba(0,228,180,0.07);
          font-family: var(--mono);
          font-size: 10px;
          font-weight: 700;
          color: var(--teal);
          letter-spacing: 0.14em;
          text-transform: uppercase;
          margin-bottom: 28px;
        }
        .sb-eyebrow-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: var(--teal);
          animation: pulse-dot 2s infinite;
        }
        @keyframes pulse-dot {
          0%,100%{ opacity:1; transform:scale(1) }
          50%{ opacity:0.4; transform:scale(0.75) }
        }

        .sb-h1 {
          font-family: var(--display);
          font-size: clamp(40px, 5.5vw, 72px);
          font-weight: 900;
          line-height: 1.04;
          letter-spacing: -0.03em;
          color: var(--text);
          margin-bottom: 24px;
        }
        .sb-h1-teal {
          background: linear-gradient(92deg, var(--teal), var(--blue));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          display: inline-block;
        }

        /* ── Glitch ── */
        .sb-glitch {
          position: relative;
          display: inline-block;
        }
        .sb-glitch::before,
        .sb-glitch::after {
          content: attr(data-text);
          position: absolute;
          top: 0; left: 0;
          background: linear-gradient(92deg, var(--teal), var(--blue));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .sb-glitch::before {
          animation: glitch-a 5s infinite;
          clip-path: polygon(0 0, 100% 0, 100% 40%, 0 40%);
        }
        .sb-glitch::after {
          animation: glitch-b 5s infinite;
          clip-path: polygon(0 60%, 100% 60%, 100% 100%, 0 100%);
        }
        @keyframes glitch-a {
          0%,94%,100%{ transform:none; opacity:0 }
          95%{ transform:translate(-2px,1px); opacity:0.8 }
          96%{ transform:translate(2px,-1px); opacity:0.8 }
          97%{ transform:none; opacity:0 }
        }
        @keyframes glitch-b {
          0%,94%,100%{ transform:none; opacity:0 }
          95%{ transform:translate(2px,-1px); opacity:0.7 }
          96%{ transform:translate(-2px,1px); opacity:0.7 }
          97%{ transform:none; opacity:0 }
        }

        .sb-hero-sub {
          font-size: 17px;
          line-height: 1.72;
          color: var(--muted);
          max-width: 520px;
          margin-bottom: 36px;
        }

        .sb-btn-row {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 52px;
        }
        .sb-btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 0 28px;
          height: 50px;
          border-radius: 12px;
          background: linear-gradient(135deg, var(--teal), #00b896);
          color: #04070f;
          font-weight: 800;
          font-size: 14px;
          text-decoration: none;
          transition: opacity 0.2s, transform 0.15s, box-shadow 0.2s;
          box-shadow: 0 0 28px rgba(0,228,180,0.3);
        }
        .sb-btn-primary:hover { opacity: 0.88; transform: translateY(-1px); box-shadow: 0 0 40px rgba(0,228,180,0.4); }
        .sb-btn-secondary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 0 24px;
          height: 50px;
          border-radius: 12px;
          border: 1px solid var(--border);
          color: var(--muted);
          font-weight: 600;
          font-size: 14px;
          text-decoration: none;
          transition: border-color 0.2s, color 0.2s;
        }
        .sb-btn-secondary:hover { border-color: var(--teal-dim); color: var(--text); }

        /* ── Hero stat row ── */
        .sb-stat-row {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1px;
          background: var(--border);
          border: 1px solid var(--border);
          border-radius: 16px;
          overflow: hidden;
        }
        .sb-stat {
          background: var(--surface);
          padding: 20px 22px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .sb-stat-val {
          font-family: var(--mono);
          font-size: 26px;
          font-weight: 700;
          color: var(--text);
        }
        .sb-stat-label {
          font-size: 11px;
          color: var(--dim);
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }

        /* ── Hero right: terminal card ── */
        .sb-terminal {
          border: 1px solid var(--border);
          border-radius: 20px;
          background: var(--surface);
          overflow: hidden;
          position: sticky;
          top: 24px;
        }
        .sb-terminal-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 14px 18px;
          border-bottom: 1px solid var(--border);
          background: var(--surface2);
        }
        .sb-term-dot {
          width: 10px; height: 10px;
          border-radius: 50%;
        }
        .sb-term-title {
          font-family: var(--mono);
          font-size: 11px;
          color: var(--dim);
          letter-spacing: 0.1em;
          margin-left: 4px;
        }
        .sb-term-body {
          padding: 24px 20px;
          font-family: var(--mono);
          font-size: 12px;
          line-height: 2;
          color: var(--muted);
        }
        .sb-term-key { color: var(--blue); }
        .sb-term-val-enc { color: var(--teal); }
        .sb-term-val-pub { color: var(--muted); }
        .sb-term-comment { color: var(--dim); }
        .sb-term-divider {
          border: none;
          border-top: 1px solid var(--border);
          margin: 16px 0;
        }
        .sb-term-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 20px;
          border-top: 1px solid var(--border);
        }
        .sb-term-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 12px;
          border-radius: 100px;
          font-family: var(--mono);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.1em;
        }
        .sb-term-badge.enc {
          background: rgba(0,228,180,0.1);
          border: 1px solid var(--border-accent);
          color: var(--teal);
        }
        .sb-term-badge.pub {
          background: rgba(108,142,255,0.1);
          border: 1px solid rgba(108,142,255,0.22);
          color: var(--blue);
        }

        /* ── Steps ── */
        .sb-steps-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 1px;
          background: var(--border);
          border: 1px solid var(--border);
          border-radius: 20px;
          overflow: hidden;
          margin-bottom: 88px;
        }
        .sb-step {
          background: var(--surface);
          padding: 36px 28px;
          position: relative;
          transition: background 0.2s;
        }
        .sb-step:hover { background: var(--surface2); }
        .sb-step-num {
          font-family: var(--mono);
          font-size: 10px;
          color: var(--dim);
          letter-spacing: 0.16em;
          text-transform: uppercase;
          margin-bottom: 20px;
        }
        .sb-step-icon {
          width: 48px; height: 48px;
          border-radius: 14px;
          background: rgba(0,228,180,0.08);
          border: 1px solid var(--border-accent);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 20px;
          color: var(--teal);
        }
        .sb-step h3 {
          font-family: var(--display);
          font-size: 18px;
          font-weight: 700;
          color: var(--text);
          margin-bottom: 12px;
          line-height: 1.3;
        }
        .sb-step p {
          font-size: 14px;
          line-height: 1.75;
          color: var(--muted);
        }

        /* ── Feature bento ── */
        .sb-bento {
          display: grid;
          grid-template-columns: 1fr 1fr;
          grid-template-rows: auto auto;
          gap: 16px;
          margin-bottom: 88px;
        }
        .sb-bento-cell {
          border: 1px solid var(--border);
          border-radius: 20px;
          background: var(--surface);
          padding: 32px;
          transition: border-color 0.25s, background 0.25s, transform 0.2s;
        }
        .sb-bento-cell:hover {
          border-color: rgba(0,228,180,0.18);
          background: var(--surface2);
          transform: translateY(-2px);
        }
        .sb-bento-cell.wide {
          grid-column: 1 / -1;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 32px;
          align-items: center;
          background: linear-gradient(135deg, rgba(0,228,180,0.06), rgba(108,142,255,0.04), transparent);
          border-color: rgba(0,228,180,0.14);
        }
        .sb-feature-icon {
          width: 48px; height: 48px;
          border-radius: 14px;
          background: rgba(255,255,255,0.05);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 18px;
        }
        .sb-feature-icon.teal { color: var(--teal); }
        .sb-feature-icon.blue { color: var(--blue); }
        .sb-bento-cell h3 {
          font-family: var(--display);
          font-size: 18px;
          font-weight: 700;
          color: var(--text);
          margin-bottom: 10px;
        }
        .sb-bento-cell p {
          font-size: 14px;
          line-height: 1.75;
          color: var(--muted);
        }
        .sb-bento-wide-left h2 {
          font-family: var(--display);
          font-size: clamp(26px, 3vw, 38px);
          font-weight: 800;
          color: var(--text);
          letter-spacing: -0.02em;
          margin-bottom: 14px;
        }
        .sb-bento-wide-left p {
          font-size: 15px;
          line-height: 1.72;
          color: var(--muted);
          margin-bottom: 24px;
        }
        .sb-stack-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .sb-stack-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: var(--surface);
          font-family: var(--mono);
          font-size: 12px;
        }
        .sb-stack-item-label { color: var(--muted); }
        .sb-stack-item-role {
          margin-left: auto;
          color: var(--dim);
          font-size: 11px;
        }
        .sb-stack-dot-teal {
          width: 8px; height: 8px;
          border-radius: 50%;
          background: var(--teal);
          flex-shrink: 0;
        }
        .sb-stack-dot-blue {
          width: 8px; height: 8px;
          border-radius: 50%;
          background: var(--blue);
          flex-shrink: 0;
        }

        /* ── CTA ── */
        .sb-cta {
          border: 1px solid var(--border);
          border-radius: 24px;
          padding: 72px 48px;
          text-align: center;
          background: linear-gradient(135deg, rgba(0,228,180,0.08), rgba(108,142,255,0.05), rgba(255,255,255,0.02));
          position: relative;
          overflow: hidden;
        }
        .sb-cta::before {
          content: '';
          position: absolute;
          top: -80px; left: 50%;
          transform: translateX(-50%);
          width: 400px; height: 200px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(0,228,180,0.12) 0%, transparent 70%);
          pointer-events: none;
        }
        .sb-cta h2 {
          font-family: var(--display);
          font-size: clamp(28px, 4vw, 48px);
          font-weight: 900;
          color: var(--text);
          letter-spacing: -0.025em;
          margin-bottom: 16px;
        }
        .sb-cta p {
          font-size: 16px;
          line-height: 1.72;
          color: var(--muted);
          max-width: 480px;
          margin: 0 auto 32px;
        }
        .sb-cta-btns {
          display: flex;
          gap: 12px;
          justify-content: center;
          flex-wrap: wrap;
        }

        /* ── Footer ── */
        .sb-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 16px;
          padding: 28px 0 0;
          border-top: 1px solid var(--border);
          margin-top: 48px;
        }
        .sb-footer-copy {
          font-family: var(--mono);
          font-size: 11px;
          color: var(--dim);
          letter-spacing: 0.08em;
        }
        .sb-footer-links {
          display: flex;
          gap: 20px;
        }
        .sb-footer-link {
          font-size: 13px;
          color: var(--dim);
          text-decoration: none;
          transition: color 0.2s;
        }
        .sb-footer-link:hover { color: var(--teal); }

        /* ── Responsive ── */
        @media (max-width: 900px) {
          .sb-hero { grid-template-columns: 1fr; gap: 40px; }
          .sb-steps-grid { grid-template-columns: 1fr; }
          .sb-bento { grid-template-columns: 1fr; }
          .sb-bento-cell.wide { grid-column: 1; grid-template-columns: 1fr; }
          .sb-stat-row { grid-template-columns: 1fr; }
          .sb-nav-links { display: none; }
          .sb-wrap { padding: 0 16px 60px; }
          .sb-cta { padding: 48px 24px; }
        }
      `}</style>

      <div className="sb-root">
        <div className="sb-grid-bg" />
        <div className="sb-glow-a" />
        <div className="sb-glow-b" />

        <div className="sb-wrap">
          {/* Nav */}
          <nav className="sb-nav">
            <InteractiveLink href="/" className="sb-logo">
              <div className="sb-logo-mark">
                <Shield style={{ width: 20, height: 20, color: "#04070f" }} />
              </div>
              <div>
                <div className="sb-logo-name">ShieldBet</div>
                <div className="sb-logo-tag">Confidential prediction markets</div>
              </div>
            </InteractiveLink>
            <div className="sb-nav-links">
              <InteractiveLink href="/markets" className="sb-nav-link">Markets</InteractiveLink>
              <InteractiveLink href="/my-bets" className="sb-nav-link">My Bets</InteractiveLink>
              <InteractiveLink href="/create" className="sb-nav-link">Create</InteractiveLink>
            </div>
            <LandingWalletButton />
          </nav>
        </div>

        {/* Ticker — full bleed */}
        <Ticker />

        <div className="sb-wrap">
          {/* Hero */}
          <section className="sb-hero mt-14">
            <div>
              <div className="sb-eyebrow">
                <span className="sb-eyebrow-dot" />
                Zama fhEVM · Optimistic Oracle v1
              </div>

              <h1 className="sb-h1">
                Bet with a{" "}
                <span className="sb-h1-teal">
                  <p>confidential</p>
                </span>
                {" "}core.
              </h1>

              <p className="sb-hero-sub">
                ShieldBet is a private prediction market where your side selection is encrypted on-chain, your stake is public in ETH, and every market moves through a real proposal, challenge, finalization, and claim lifecycle.
              </p>

              <div className="sb-btn-row">
                <InteractiveLink href="/markets" className="sb-btn-primary">
                  Enter Markets <ArrowRight style={{ width: 16, height: 16 }} />
                </InteractiveLink>
                <InteractiveLink href="/create" className="sb-btn-secondary">
                  Create Market
                </InteractiveLink>
              </div>

              <div className="sb-stat-row">
                <div className="sb-stat">
                  <div className="sb-stat-val" style={{ color: "var(--teal)" }}>
                    <Counter target={2841} />
                  </div>
                  <div className="sb-stat-label">Encrypted bets cast</div>
                </div>
                <div className="sb-stat">
                  <div className="sb-stat-val">
                    <Counter target={142} />
                  </div>
                  <div className="sb-stat-label">Active markets</div>
                </div>
                <div className="sb-stat">
                  <div className="sb-stat-val">
                    <Counter target={100} suffix="%" />
                  </div>
                  <div className="sb-stat-label">Sides stay hidden</div>
                </div>
              </div>
            </div>

            {/* Terminal card */}
            <div className="sb-terminal">
              <div className="sb-terminal-bar">
                <div className="sb-term-dot" style={{ background: "#ff5f57" }} />
                <div className="sb-term-dot" style={{ background: "#febc2e" }} />
                <div className="sb-term-dot" style={{ background: "#28c840" }} />
                <span className="sb-term-title">shieldbet · bet-state.json</span>
              </div>
              <div className="sb-term-body">
                <div><span className="sb-term-key">market_id</span>      <span className="sb-term-val-pub">0x3f2e…8a1c</span></div>
                <div><span className="sb-term-key">stake_eth</span>      <span className="sb-term-val-pub">0.25 ETH</span> <span className="sb-term-comment">// public</span></div>
                <div><span className="sb-term-key">bet_side</span>       <span className="sb-term-val-enc">euint8(0x██)</span> <span className="sb-term-comment">// encrypted</span></div>
                <div><span className="sb-term-key">pool_yes</span>       <span className="sb-term-val-enc">euint64(0x██)</span> <span className="sb-term-comment">// encrypted</span></div>
                <div><span className="sb-term-key">pool_no</span>        <span className="sb-term-val-enc">euint64(0x██)</span> <span className="sb-term-comment">// encrypted</span></div>
                <hr className="sb-term-divider" />
                <div><span className="sb-term-key">proposal</span>       <span className="sb-term-val-pub">oracle stake posted</span></div>
                <div><span className="sb-term-key">challenge</span>      <span className="sb-term-val-pub">open during dispute window</span></div>
                <div><span className="sb-term-key">finalization</span>   <span className="sb-term-val-pub">owner locks outcome</span></div>
                <div><span className="sb-term-key">claim_path</span>     <span className="sb-term-val-pub">manual payout → claim</span></div>
              </div>
              <div className="sb-term-row">
                <span className="sb-term-badge enc">
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--teal)", display: "inline-block" }} />
                  Side encrypted
                </span>
                <span className="sb-term-badge pub">
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--blue)", display: "inline-block" }} />
                  Stake public
                </span>
              </div>
            </div>
          </section>

          {/* Steps */}
          <div className="sb-steps-grid">
            {[
              {
                num: "Step 01",
                icon: <Shield style={{ width: 22, height: 22 }} />,
                title: "Connect your wallet",
                body: "Use a supported wallet to create markets, place positions, propose outcomes, or claim rewards through the same account.",
              },
              {
                num: "Step 02",
                icon: <Lock style={{ width: 22, height: 22 }} />,
                title: "Create a market",
                body: "Define the question, category, market type, outcomes, expiry, and resolution criteria before publishing the market on-chain.",
              },
              {
                num: "Step 03",
                icon: <EyeOff style={{ width: 22, height: 22 }} />,
                title: "Place a private position",
                body: "Your side is encrypted client-side with Zama fhEVM before submission, while your ETH stake is escrowed publicly in the pool.",
              },
              {
                num: "Step 04",
                icon: <Gavel style={{ width: 22, height: 22 }} />,
                title: "Resolve with proposal and challenge",
                body: "After expiry, an oracle proposes the result, challengers can dispute it, and the market moves through an explicit dispute window before finalization.",
              },
              {
                num: "Step 05",
                icon: <CheckCircle2 style={{ width: 22, height: 22 }} />,
                title: "Claim rewards",
                body: "Once the owner finalizes and assigns payout, the winning wallet claims from the market contract and can optionally verify the claim through Lit.",
              },
            ].map((s) => (
              <div key={s.num} className="sb-step">
                <div className="sb-step-num">{s.num}</div>
                <div className="sb-step-icon">{s.icon}</div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            ))}
          </div>

          {/* Bento features */}
          <div className="sb-bento">
            <div className="sb-bento-cell">
              <div className="sb-feature-icon teal">
                <EyeOff style={{ width: 22, height: 22 }} />
              </div>
              <h3>Private positions</h3>
              <p>Your directional side is encrypted on-chain. Other traders cannot read whether you are on YES, NO, or any categorical branch.</p>
            </div>

            <div className="sb-bento-cell">
              <div className="sb-feature-icon blue">
                <CheckCircle2 style={{ width: 22, height: 22 }} />
              </div>
              <h3>Binary and categorical markets</h3>
              <p>Create simple yes/no markets or multi-outcome markets with several possible resolutions under the same lifecycle.</p>
            </div>

            <div className="sb-bento-cell wide">
              <div className="sb-bento-wide-left">
                <h2>Built around one coherent market lifecycle.</h2>
                <p>Connect, create, place a private position, move through optimistic resolution, and claim rewards. Each surface in the app now follows that same sequence.</p>
                <div className="sb-btn-row" style={{ marginBottom: 0 }}>
                  <InteractiveLink href="/markets" className="sb-btn-primary">
                    See live markets <ArrowRight style={{ width: 15, height: 15 }} />
                  </InteractiveLink>
                </div>
              </div>
              <div className="sb-stack-list">
                {[
                  { dot: "teal", label: "Zama fhEVM", role: "Encrypted compute" },
                  { dot: "blue", label: "Optimistic Oracle", role: "Proposal + challenge" },
                  { dot: "teal", label: "Owner Finalization", role: "Settled outcome" },
                  { dot: "blue", label: "Lit Protocol", role: "Optional claim attestation" },
                  { dot: "teal", label: "RainbowKit", role: "Wallet UX" },
                ].map((item) => (
                  <div key={item.label} className="sb-stack-item">
                    <span className={item.dot === "teal" ? "sb-stack-dot-teal" : "sb-stack-dot-blue"} />
                    <span className="sb-stack-item-label">{item.label}</span>
                    <span className="sb-stack-item-role">{item.role}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="sb-bento-cell">
              <div className="sb-feature-icon teal">
                <Zap style={{ width: 22, height: 22 }} />
              </div>
              <h3>Optimistic resolution</h3>
              <p>Markets move from active to expired, proposed, disputed, and finalized. Proposal and challenge both require staking to discourage bad resolution behavior.</p>
            </div>

            <div className="sb-bento-cell">
              <div className="sb-feature-icon blue">
                <Shield style={{ width: 22, height: 22 }} />
              </div>
              <h3>Claim after settlement</h3>
              <p>Once the market is finalized and payout is assigned, the winner claims directly from the contract. Your own side is visible to you in the dashboard.</p>
            </div>
          </div>

          {/* CTA */}
          <section className="sb-cta">
            <h2>Start betting confidentially.</h2>
            <p>Explore active encrypted markets, create your own, or review your positions — all from a single wallet-native interface.</p>
            <div className="sb-cta-btns">
              <InteractiveLink href="/markets" className="sb-btn-primary">
                Explore Markets <ArrowRight style={{ width: 16, height: 16 }} />
              </InteractiveLink>
              <InteractiveLink href="/create" className="sb-btn-secondary">
                Launch a Market
              </InteractiveLink>
            </div>
          </section>

          {/* Footer */}
          <footer className="sb-footer">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div className="sb-logo-mark" style={{ width: 28, height: 28, borderRadius: 8 }}>
                <Shield style={{ width: 14, height: 14, color: "#04070f" }} />
              </div>
              <span className="sb-footer-copy">© 2026 SHIELDBET · SEPOLIA TESTNET</span>
            </div>
            <div className="sb-footer-links">
              <a href="#" className="sb-footer-link">Docs</a>
              <a href="#" className="sb-footer-link">GitHub</a>
              <a href="#" className="sb-footer-link">Twitter</a>
            </div>
          </footer>
        </div>
      </div>
    </>
  );
}
