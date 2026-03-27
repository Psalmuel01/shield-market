"use client";

import { formatEther } from "viem";

export interface SettlementParticipantView {
  bettor: `0x${string}`;
  outcome: "YES" | "NO";
  amountWei: string;
  isWinner: boolean;
  projectedPayoutWei: string;
  assignedPayoutWei: string;
  hasClaimed: boolean;
}

export interface SettlementPlanView {
  marketId: string;
  resolvedOutcome: "YES" | "NO";
  totalPoolWei: string;
  marketPoolBalanceWei: string;
  reservedPayoutBalanceWei: string;
  feeBasisPoints: string;
  feeWei: string;
  distributablePoolWei: string;
  totalWinningSideWei: string;
  participants: SettlementParticipantView[];
}

function formatEthValue(valueWei: string) {
  return `${Number(formatEther(BigInt(valueWei || "0"))).toFixed(4)} ETH`;
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function SettlementPlanPanel({ plan }: { plan: SettlementPlanView }) {
  const winners = plan.participants.filter((participant) => participant.isWinner);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 text-xs text-slate-600 dark:text-slate-300 md:grid-cols-2">
        <div className="surface-muted px-3 py-2">
          <span className="font-medium">Resolved outcome:</span> {plan.resolvedOutcome}
        </div>
        <div className="surface-muted px-3 py-2">
          <span className="font-medium">Total winning side:</span> {formatEthValue(plan.totalWinningSideWei)}
        </div>
        <div className="surface-muted px-3 py-2">
          <span className="font-medium">Distributable pool:</span> {formatEthValue(plan.distributablePoolWei)}
        </div>
        <div className="surface-muted px-3 py-2">
          <span className="font-medium">Fee:</span> {formatEthValue(plan.feeWei)} ({Number(plan.feeBasisPoints) / 100}%)
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
          <thead className="bg-slate-50 dark:bg-slate-900/60">
            <tr className="text-left text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              <th className="px-3 py-3">Wallet</th>
              <th className="px-3 py-3">Side</th>
              <th className="px-3 py-3">Stake</th>
              <th className="px-3 py-3">Projected payout</th>
              <th className="px-3 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {plan.participants.map((participant) => (
              <tr key={participant.bettor} className="bg-white dark:bg-slate-950/40">
                <td className="px-3 py-3 font-mono-ui text-xs text-slate-700 dark:text-slate-300" title={participant.bettor}>
                  {shortAddress(participant.bettor)}
                </td>
                <td className="px-3 py-3 text-slate-700 dark:text-slate-300">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${
                      participant.outcome === "YES"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                        : "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
                    }`}
                  >
                    {participant.outcome}
                  </span>
                </td>
                <td className="px-3 py-3 text-slate-700 dark:text-slate-300">{formatEthValue(participant.amountWei)}</td>
                <td className="px-3 py-3 text-slate-700 dark:text-slate-300">
                  {participant.isWinner ? formatEthValue(participant.projectedPayoutWei) : "0.0000 ETH"}
                </td>
                <td className="px-3 py-3 text-slate-700 dark:text-slate-300">
                  {participant.isWinner ? (
                    participant.hasClaimed ? (
                      <span className="text-slate-500 dark:text-slate-400">Claimed</span>
                    ) : BigInt(participant.assignedPayoutWei) > 0n ? (
                      <span className="text-emerald-600 dark:text-emerald-400">Assigned</span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400">Ready to assign</span>
                    )
                  ) : (
                    <span className="text-slate-500 dark:text-slate-400">Lost</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Settlement data becomes decryptable only after resolution. This table is derived from decrypted resolved bets, not public trading-time order flow.
      </p>
      {winners.length === 0 ? (
        <p className="text-xs text-amber-600 dark:text-amber-400">No winning positions were found in the current settlement data.</p>
      ) : null}
    </div>
  );
}
