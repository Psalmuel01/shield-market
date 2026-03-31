"use client";

import { CheckCircle2, CircleDot, Hourglass, Scale, Trophy } from "lucide-react";
import { MARKET_LIFECYCLE_STEPS, MarketStatus, getMarketLifecycleIndex } from "@/lib/market-ui";

interface MarketLifecycleProps {
  currentStatus: MarketStatus;
  compact?: boolean;
}

const stepIcons = {
  Active: CircleDot,
  Expired: Hourglass,
  Proposed: Scale,
  Disputed: Scale,
  Finalized: Trophy
} as const;

export function MarketLifecycle({ currentStatus, compact = false }: MarketLifecycleProps) {
  const currentIndex = getMarketLifecycleIndex(currentStatus);

  return (
    <div className={`grid gap-3 ${compact ? "md:grid-cols-5" : "md:grid-cols-2"}`}>
      {MARKET_LIFECYCLE_STEPS.map((step, index) => {
        const Icon = stepIcons[step.key];
        const completed = currentIndex > index;
        const active = currentIndex === index;

        return (
          <div
            key={step.key}
            className={`rounded-[1.25rem] border p-4 transition ${
              active
                ? "border-[var(--primary)]/22 bg-[var(--primary)]/10"
                : completed
                  ? "border-emerald-400/16 bg-emerald-400/8"
                  : "border-white/6 bg-white/[0.03]"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
                Step {String(index + 1).padStart(2, "0")}
              </span>
              <span
                className={`inline-flex h-8 w-8 items-center justify-center rounded-full border ${
                  active
                    ? "border-[var(--primary)]/20 bg-[var(--primary)]/12 text-[var(--primary)]"
                    : completed
                      ? "border-emerald-400/16 bg-emerald-400/12 text-emerald-300"
                      : "border-white/10 bg-white/[0.04] text-white/40"
                }`}
              >
                {completed ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </span>
            </div>
            <div className="mt-4">
              <div className="font-display text-base font-bold text-white">{step.title}</div>
              <p className={`mt-2 text-sm leading-6 ${compact ? "text-white/55" : "text-white/62"}`}>{step.description}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
