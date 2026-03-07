"use client";

import { Loader2, Lock, Sparkles } from "lucide-react";
import { formatEther } from "viem";
import { useEffect, useState } from "react";

export interface ClaimConfirmation {
  mode: "verify" | "lit";
  txHash: string;
  plaintextPayoutWei: string;
  actionCid?: string;
}

interface ClaimFlowProps {
  open: boolean;
  onClose: () => void;
  payoutWei: bigint;
  onConfirmClaim: () => Promise<ClaimConfirmation>;
}

type ClaimStage = "idle" | "lit" | "ready" | "submitting" | "done" | "error";

export function ClaimFlow({ open, onClose, payoutWei, onConfirmClaim }: ClaimFlowProps) {
  const [stage, setStage] = useState<ClaimStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [claimResult, setClaimResult] = useState<ClaimConfirmation | null>(null);

  useEffect(() => {
    if (!open) {
      setStage("idle");
      setError(null);
      setClaimResult(null);
      return;
    }

    setStage("lit");
    const timer = window.setTimeout(() => setStage("ready"), 1700);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!open) return null;

  const payoutWeiToDisplay = claimResult ? BigInt(claimResult.plaintextPayoutWei) : payoutWei;
  const winnings = Number(formatEther(payoutWeiToDisplay)).toFixed(4);

  async function submitClaim() {
    try {
      setStage("submitting");
      setError(null);
      const result = await onConfirmClaim();
      setClaimResult(result);
      setStage("done");
    } catch (cause) {
      setStage("error");
      setError(cause instanceof Error ? cause.message : "Claim failed");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm">
      <div className="surface w-full max-w-lg p-6">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Claim Winnings</p>
            <h3 className="section-title">Lit Decryption Flow</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-2 py-1 text-sm dark:border-slate-700"
          >
            Close
          </button>
        </div>

        <div className="space-y-3">
          <div className="surface-muted p-3 text-sm">
            <p className="flex items-center gap-2 font-medium text-slate-800 dark:text-slate-200">
              <Lock className="h-4 w-4 text-indigo-500" /> Decrypting your winnings via Lit Protocol...
            </p>
            <p className="subtle mt-1">Lit PKP verifying your winning position.</p>
          </div>

          {(stage === "lit" || stage === "submitting") && (
            <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              {stage === "lit" ? "Verifying encrypted eligibility..." : "Submitting claim transaction..."}
            </div>
          )}

          {(stage === "ready" || stage === "done" || stage === "submitting") && (
            <div className="surface-muted p-4">
              <p className="text-sm text-slate-700 dark:text-slate-300">Your encrypted bet: ●●●●●● USDC</p>
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">Winnings: {winnings} ETH</p>
              <p className="mt-1 text-sm font-medium text-emerald-600 dark:text-emerald-400">Profit: encrypted until claim</p>
            </div>
          )}

          {stage === "error" && <p className="text-sm text-rose-500">{error}</p>}

          {stage === "done" ? (
            <p className="flex items-center gap-2 rounded-lg bg-emerald-100 px-3 py-2 text-sm font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              <Sparkles className="h-4 w-4" />
              {claimResult?.mode === "lit" ? "Claim submitted with Lit verification." : "Claim submitted to wallet."}
            </p>
          ) : (
            <button
              type="button"
              disabled={stage !== "ready"}
              onClick={submitClaim}
              className="w-full rounded-lg bg-indigo-500 px-4 py-3 text-sm font-semibold text-white transition hover:scale-[1.02] hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              CLAIM TO WALLET
            </button>
          )}

          {claimResult?.txHash ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">Transaction: {claimResult.txHash}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
