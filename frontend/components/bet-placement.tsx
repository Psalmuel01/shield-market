"use client";

import { Check, Lock, Shield } from "lucide-react";

interface BetPlacementProps {
  selectedOutcome: number;
  outcomeLabels: string[];
  amount: string;
  assetLabel: string;
  balanceLabel: string;
  alreadyBet: boolean;
  isSubmitting: boolean;
  submitLabel: string;
  statusHint: string;
  onSelectOutcome: (next: number) => void;
  onAmountChange: (next: string) => void;
  onMax: () => void;
  onSubmit: () => void;
}

export function BetPlacement({
  selectedOutcome,
  outcomeLabels,
  amount,
  assetLabel,
  balanceLabel,
  alreadyBet,
  isSubmitting,
  submitLabel,
  statusHint,
  onSelectOutcome,
  onAmountChange,
  onMax,
  onSubmit
}: BetPlacementProps) {
  return (
    <div className="vm-card space-y-6 p-6 md:p-7">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-bold text-white">Place Confidential Bet</h2>
        <span className="vm-category-pill border-[var(--primary)]/20 bg-[var(--primary)]/10 text-[var(--primary)]">
          <Lock className="h-3.5 w-3.5" />
          Encrypted
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {outcomeLabels.map((label, index) => {
          const selected = selectedOutcome === index;
          return (
            <button
              key={`${label}-${index}`}
              type="button"
              disabled={alreadyBet || isSubmitting}
              onClick={() => onSelectOutcome(index)}
              className={`rounded-[1.35rem] border p-4 text-left transition ${
                selected
                  ? "border-[var(--primary)]/30 bg-[var(--primary)]/10"
                  : "border-white/6 bg-white/[0.03] hover:border-white/12 hover:bg-white/[0.05]"
              } disabled:cursor-not-allowed disabled:opacity-55`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Outcome</div>
                  <div className="font-display mt-2 text-lg font-bold text-white">{label}</div>
                </div>
                <span
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full border ${
                    selected ? "border-[var(--primary)] bg-[var(--primary)] text-[#081018]" : "border-white/12 text-white/45"
                  }`}
                >
                  {selected ? <Check className="h-4 w-4" /> : index + 1}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <label htmlFor="bet-amount" className="vm-field-label mb-0">
            Stake Amount ({assetLabel})
          </label>
          <span className="text-xs text-white/45">Available: {balanceLabel}</span>
        </div>
        <div className="relative">
          <input
            id="bet-amount"
            value={amount}
            disabled={alreadyBet || isSubmitting}
            onChange={(event) => onAmountChange(event.target.value)}
            className="vm-input pr-20 text-lg font-semibold"
            placeholder="0.00"
          />
          <button
            type="button"
            disabled={alreadyBet || isSubmitting}
            onClick={onMax}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl border border-white/8 bg-white/[0.05] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/72 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Max
          </button>
        </div>
      </div>

      <div className="rounded-[1.5rem] border border-[var(--primary)]/16 bg-[var(--primary)]/8 p-5">
        <div className="flex items-start gap-4">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/8 text-[var(--primary)]">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--primary)]">Confidential processing</div>
            <p className="mt-2 text-sm leading-7 text-white/72">{statusHint}</p>
          </div>
        </div>
      </div>

      <button
        type="button"
        disabled={alreadyBet || isSubmitting}
        onClick={onSubmit}
        className="vm-primary-btn w-full disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Lock className={`h-4 w-4 ${isSubmitting ? "enc-pulse" : ""}`} />
        {submitLabel}
      </button>
    </div>
  );
}
