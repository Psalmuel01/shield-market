"use client";

import { CheckCircle2, ChevronRight, Clock, Users } from "lucide-react";
import { useMemo } from "react";
import { formatEther, formatUnits } from "viem";
import { InteractiveLink } from "@/components/interactive-link";
import { cidToExplorer, formatDeadline, getCountdown } from "@/lib/format";
import { getEncryptedBandCount, getMarketAsset, getMarketStatus, getMarketStatusBlurb, getMarketType, MarketCategory, renderEncryptedDots } from "@/lib/market-ui";

interface MarketCardProps {
  marketId: bigint;
  question: string;
  deadline: bigint;
  outcome: number;
  status: number;
  marketType: number;
  assetType: number;
  category: MarketCategory;
  metadataCid: string;
  resolutionCid: string;
  poolBalanceWei: bigint;
}

const categoryStyles: Record<string, string> = {
  Crypto: "text-orange-300 bg-orange-400/10 border-orange-400/20",
  Politics: "text-purple-300 bg-purple-400/10 border-purple-400/20",
  Sports: "text-emerald-300 bg-emerald-400/10 border-emerald-400/20",
  Science: "text-cyan-300 bg-cyan-400/10 border-cyan-400/20",
  Other: "text-slate-300 bg-slate-400/10 border-slate-400/20"
};

const statusStyles: Record<string, string> = {
  Active: "text-emerald-300 bg-emerald-400/10 border-emerald-400/20",
  Expired: "text-amber-300 bg-amber-400/10 border-amber-400/20",
  Proposed: "text-blue-300 bg-blue-400/10 border-blue-400/20",
  Disputed: "text-rose-300 bg-rose-400/10 border-rose-400/20",
  Finalized: "text-slate-200 bg-white/6 border-white/10"
};

export function MarketCard({
  marketId,
  question,
  deadline,
  outcome,
  status: rawStatus,
  marketType: rawType,
  assetType,
  category,
  metadataCid,
  resolutionCid,
  poolBalanceWei
}: MarketCardProps) {
  const status = getMarketStatus(rawStatus, deadline);
  const marketType = getMarketType(rawType);
  const asset = getMarketAsset(assetType);
  const bandCount = useMemo(() => getEncryptedBandCount(marketId), [marketId]);
  const bandText = renderEncryptedDots(bandCount);
  const closingLabel = status === "Active" ? getCountdown(deadline) : formatDeadline(deadline);
  const statusBlurb = getMarketStatusBlurb(status);

  return (
    <div className="vm-card vm-card--interactive flex h-full min-h-[22rem] flex-col">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`vm-category-pill ${categoryStyles[category] || categoryStyles.Other}`}>{category}</span>
          <span className="vm-category-pill border-white/8 bg-white/4 text-white/55">{marketType}</span>
        </div>
        <span className={`vm-status-pill ${statusStyles[status] || statusStyles.Active}`}>
          {status === "Finalized" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span className="h-2 w-2 rounded-full bg-current" />}
          {status}
        </span>
      </div>

      <div className="mt-6 flex-1">
        <InteractiveLink href={`/markets/${marketId}`} pendingClassName="opacity-75" className="block">
          <h2 className="vm-card__title transition-colors hover:text-[var(--primary)]">{question}</h2>
        </InteractiveLink>
        <p className="vm-card__description">
          {statusBlurb || "Confidential activity remains abstracted while the market is live. Open the detail view to place an encrypted side selection or inspect resolution state."}
        </p>
        <div className="mt-6 text-[11px] font-bold uppercase tracking-[0.18em] text-white/35">Pool</div>
        <div className="mt-2 font-mono text-2xl font-bold text-white dark:text-white">
          {asset === "ETH" ? `${Number(formatEther(poolBalanceWei)).toFixed(4)} ETH` : `${Number(formatUnits(poolBalanceWei, 6)).toFixed(2)} USDC`}
        </div>
      </div>

      <div className="vm-encrypted-band mt-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--primary)]">Encrypted activity</div>
            <div className="mt-3 flex items-center gap-3">
              <span className="vm-encrypted-dots">{bandText}</span>
              <span className="text-sm font-semibold text-white/82">{bandCount} confidential positions</span>
            </div>
          </div>
          <Users className="h-5 w-5 text-[var(--primary)]" />
        </div>
      </div>

      <div className="vm-card__footer mt-6">
        <div className="space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Timing</div>
          <div className="flex items-center gap-2 text-sm font-semibold text-white/82">
            <Clock className="h-4 w-4 text-[var(--accent)]" />
            {status === "Active" ? `Ends in ${closingLabel}` : closingLabel}
          </div>
        </div>

        <InteractiveLink
          href={`/markets/${marketId}`}
          pendingClassName="opacity-80"
          className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--primary)]/20 bg-[var(--primary)]/10 text-[var(--primary)] transition hover:bg-[var(--primary)] hover:text-[#081018]"
        >
          <ChevronRight className="h-5 w-5" />
        </InteractiveLink>
      </div>

      {(metadataCid || resolutionCid) && (
        <div className="mt-4 flex flex-wrap gap-3 text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
          {metadataCid ? <a href={cidToExplorer(metadataCid)} target="_blank" rel="noreferrer" className="transition hover:text-[var(--primary)]">Metadata CID</a> : null}
          {resolutionCid ? <a href={cidToExplorer(resolutionCid)} target="_blank" rel="noreferrer" className="transition hover:text-[var(--primary)]">Resolution CID</a> : null}
          {status === "Finalized" ? <span className="text-white/55">Resolved outcome: {outcome}</span> : null}
        </div>
      )}
    </div>
  );
}
