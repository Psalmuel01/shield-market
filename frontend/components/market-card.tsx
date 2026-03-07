"use client";

import Link from "next/link";
import { Lock, ShieldAlert } from "lucide-react";
import { useMemo } from "react";
import { cidToExplorer, formatDeadline, getCountdown } from "@/lib/format";
import { getEncryptedBandCount, getMarketStatus, inferCategory, renderEncryptedDots } from "@/lib/market-ui";

interface MarketCardProps {
  marketId: bigint;
  question: string;
  deadline: bigint;
  outcome: number;
  resolved: boolean;
  metadataCid: string;
  resolutionCid: string;
}

const categoryStyles: Record<string, string> = {
  Crypto: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300",
  Politics: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  Sports: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  Science: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300",
  Other: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
};

const statusStyles: Record<string, string> = {
  Open: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  "Closing Soon": "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
  Resolved: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300"
};

export function MarketCard({ marketId, question, deadline, outcome, resolved, metadataCid, resolutionCid }: MarketCardProps) {
  const status = getMarketStatus(deadline, resolved);
  const category = inferCategory(question);

  const encryptedBandCount = useMemo(() => getEncryptedBandCount(marketId), [marketId]);
  const encryptedBandText = renderEncryptedDots(encryptedBandCount);

  return (
    <article className="surface group p-4 transition hover:-translate-y-0.5 hover:shadow-md md:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${categoryStyles[category]}`}>{category}</span>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[status]}`}>{status}</span>
      </div>

      <Link href={`/market/${marketId}`} className="block">
        <h2 className="line-clamp-2 text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">{question}</h2>
      </Link>

      <div className="mt-3 space-y-1">
        <p className="text-sm text-slate-600 dark:text-slate-400">{getCountdown(deadline)}</p>
        <p className="text-sm text-slate-600 dark:text-slate-400">Closing {formatDeadline(deadline)}</p>
      </div>

      <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/70 p-3 dark:border-indigo-500/30 dark:bg-indigo-500/10">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-indigo-700 dark:text-indigo-300">Encrypted activity</p>
          <Lock className="enc-pulse h-4 w-4 text-indigo-500" />
        </div>
        <p className="font-mono-ui mt-1 text-sm text-indigo-700 dark:text-indigo-300">{encryptedBandText} encrypted</p>
        <p className="mt-2 text-xs text-indigo-700/80 dark:text-indigo-300/80" title="Bet amounts are fully encrypted. No one can see positions until settlement.">
          Bet amounts are fully encrypted. No one can see positions until settlement.
        </p>
      </div>

      {resolved && (
        <p className="mt-3 inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 dark:bg-slate-900 dark:text-slate-300">
          <ShieldAlert className="h-3.5 w-3.5" /> Resolved: {outcome === 1 ? "YES" : "NO"}
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link
          href={`/market/${marketId}?side=yes`}
          className="rounded-lg bg-emerald-500 px-3 py-2 text-center text-sm font-semibold text-white transition hover:scale-[1.02] hover:bg-emerald-600"
        >
          YES
        </Link>
        <Link
          href={`/market/${marketId}?side=no`}
          className="rounded-lg bg-rose-500 px-3 py-2 text-center text-sm font-semibold text-white transition hover:scale-[1.02] hover:bg-rose-600"
        >
          NO
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-xs font-medium text-slate-500 dark:text-slate-400">
        {metadataCid && (
          <a href={cidToExplorer(metadataCid)} target="_blank" rel="noreferrer" className="underline underline-offset-2">
            Market CID
          </a>
        )}
        {resolutionCid && (
          <a href={cidToExplorer(resolutionCid)} target="_blank" rel="noreferrer" className="underline underline-offset-2">
            Resolution CID
          </a>
        )}
      </div>
    </article>
  );
}
