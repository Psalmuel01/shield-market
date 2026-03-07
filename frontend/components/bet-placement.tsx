"use client";

import { Lock, Shield } from "lucide-react";
import { BetOutcome } from "@/lib/encryption";

interface BetPlacementProps {
  selectedOutcome: BetOutcome;
  amount: string;
  balanceLabel: string;
  alreadyBet: boolean;
  isSubmitting: boolean;
  onSelectOutcome: (next: BetOutcome) => void;
  onAmountChange: (next: string) => void;
  onMax: () => void;
  onSubmit: () => void;
}

export function BetPlacement({
  selectedOutcome,
  amount,
  balanceLabel,
  alreadyBet,
  isSubmitting,
  onSelectOutcome,
  onAmountChange,
  onMax,
  onSubmit
}: BetPlacementProps) {
  return (
    <div className="surface p-5">
      <h2 className="section-title mb-4">Place Confidential Bet</h2>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onSelectOutcome(1)}
          className={`rounded-lg border px-4 py-3 text-sm font-semibold transition hover:scale-[1.02] ${
            selectedOutcome === 1
              ? "border-emerald-600 bg-emerald-500 text-white"
              : "border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          }`}
        >
          YES
        </button>
        <button
          type="button"
          onClick={() => onSelectOutcome(2)}
          className={`rounded-lg border px-4 py-3 text-sm font-semibold transition hover:scale-[1.02] ${
            selectedOutcome === 2
              ? "border-rose-600 bg-rose-500 text-white"
              : "border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          }`}
        >
          NO
        </button>
      </div>

      <p className="mb-2 text-sm text-slate-700 dark:text-slate-300">Selected: {selectedOutcome === 1 ? "YES" : "NO"}</p>

      <label htmlFor="amount" className="mb-2 block text-sm font-medium text-slate-800 dark:text-slate-200">
        Amount (USDC)
      </label>
      <div className="mb-3 flex items-center gap-2">
        <input
          id="amount"
          value={amount}
          onChange={(event) => onAmountChange(event.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-indigo-500/40 focus:ring-2 dark:border-slate-700 dark:bg-slate-900"
          placeholder="0.00"
        />
        <button
          type="button"
          onClick={onMax}
          className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold dark:border-slate-700"
        >
          MAX
        </button>
      </div>
      <p className="subtle mb-4">Available: {balanceLabel}</p>

      <div className="surface-muted mb-4 overflow-hidden p-3">
        <div className="relative">
          <div className="enc-flow absolute inset-y-0 w-16 bg-gradient-to-r from-transparent via-indigo-400/30 to-transparent" />
          <p className="relative flex items-center gap-2 text-sm font-medium text-indigo-700 dark:text-indigo-300">
            <Shield className="enc-pulse h-4 w-4" />
            Encrypted: Your bet amount will be hidden on-chain.
          </p>
        </div>
      </div>

      <button
        type="button"
        disabled={alreadyBet || isSubmitting}
        onClick={onSubmit}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-500 px-4 py-3 text-sm font-semibold text-white transition hover:scale-[1.02] hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Lock className="h-4 w-4" />
        {alreadyBet ? "BET ALREADY PLACED" : isSubmitting ? "ENCRYPTING TRANSACTION..." : "CONFIRM ENCRYPTED BET"}
      </button>
    </div>
  );
}
