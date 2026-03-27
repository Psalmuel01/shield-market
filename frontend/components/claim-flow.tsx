"use client";

import { Loader2, Lock, Sparkles } from "lucide-react";
import { formatEther } from "viem";
import { useEffect, useState } from "react";

export interface ClaimConfirmation {
  mode: "verify" | "lit";
  txHash: string;
  plaintextPayoutWei: string;
  actionCid?: string;
  verifiedMarketId?: string;
  verifiedAccount?: string;
  verifiedOutcome?: string;
  verifiedChecks?: string[];
  litAttestation?: {
    account: string;
    marketId: string;
    resolvedOutcome: string;
    expectedPayoutWei: string;
    txHash?: string;
    verifier: "lit-action";
    actionCid: string;
    network: string;
    issuedAt: string;
    checks: string[];
  };
}

interface ClaimFlowProps {
  open: boolean;
  onClose: () => void;
  payoutWei: bigint;
  onConfirmClaim: () => Promise<ClaimConfirmation>;
  claimType?: "winnings" | "refund";
}

type ClaimStage = "idle" | "lit" | "ready" | "submitting" | "done" | "error";

export function ClaimFlow({ open, onClose, payoutWei, onConfirmClaim, claimType = "winnings" }: ClaimFlowProps) {
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
  const payoutLabel = Number(formatEther(payoutWeiToDisplay)).toFixed(4);
  const isRefund = claimType === "refund";

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
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              {isRefund ? "Claim Refund" : "Claim Winnings"}
            </p>
            <h3 className="section-title">{isRefund ? "Refund Verification Flow" : "Claim Verification Flow"}</h3>
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
              <Lock className="h-4 w-4 text-indigo-500" />
              {isRefund ? "Verifying your refund before withdrawal..." : "Verifying your payout before withdrawal..."}
            </p>
            <p className="subtle mt-1">
              {isRefund
                ? "Refunds are verified against the cancelled market state and your recorded stake."
                : "Lit attestation runs when available. On-chain verification remains the fallback path."}
            </p>
          </div>

          {(stage === "lit" || stage === "submitting") && (
            <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              {stage === "lit"
                ? isRefund
                  ? "Preparing refund verification..."
                  : "Verifying payout eligibility..."
                : isRefund
                  ? "Submitting refund transaction..."
                  : "Submitting claim transaction..."}
            </div>
          )}

          {(stage === "ready" || stage === "done" || stage === "submitting") && (
            <div className="surface-muted p-4">
              <p className="text-sm text-slate-700 dark:text-slate-300">
                {isRefund ? "Refund amount" : "Payout amount"}: {payoutLabel} ETH
              </p>
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                {isRefund ? "Source: cancelled market refund" : "Source: deterministic payout quote"}
              </p>
              {claimResult?.verifiedOutcome ? (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Verified outcome: {claimResult.verifiedOutcome === "1" ? "YES" : claimResult.verifiedOutcome === "2" ? "NO" : claimResult.verifiedOutcome === "3" ? "Cancelled" : claimResult.verifiedOutcome}
                </p>
              ) : null}
              {claimResult?.verifiedAccount ? (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Verified wallet: {claimResult.verifiedAccount}</p>
              ) : null}
            </div>
          )}

          {claimResult?.litAttestation ? (
            <div className="surface-muted p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">What Lit Verified</p>
              <div className="mt-2 space-y-1 text-sm text-slate-700 dark:text-slate-300">
                <p>Verifier: Lit Action</p>
                <p>Action CID: {claimResult.litAttestation.actionCid}</p>
                <p>Network: {claimResult.litAttestation.network}</p>
                <p>Market ID: {claimResult.litAttestation.marketId}</p>
                <p>Wallet: {claimResult.litAttestation.account}</p>
                <p>
                  Outcome:{" "}
                  {claimResult.litAttestation.resolvedOutcome === "1"
                    ? "YES"
                    : claimResult.litAttestation.resolvedOutcome === "2"
                      ? "NO"
                      : claimResult.litAttestation.resolvedOutcome === "3"
                        ? "Cancelled"
                        : claimResult.litAttestation.resolvedOutcome}
                </p>
                <p>Payout: {claimResult.litAttestation.expectedPayoutWei} wei</p>
                {claimResult.litAttestation.txHash ? <p>Tx Hash: {claimResult.litAttestation.txHash}</p> : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {claimResult.litAttestation.checks.map((check) => (
                  <span
                    key={check}
                    className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    {check}
                  </span>
                ))}
              </div>
            </div>
          ) : claimResult?.verifiedChecks?.length ? (
            <div className="surface-muted p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Verified Checks</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {claimResult.verifiedChecks.map((check) => (
                  <span
                    key={check}
                    className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    {check}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {stage === "error" && <p className="text-sm text-rose-500">{error}</p>}

          {stage === "done" ? (
            <p className="flex items-center gap-2 rounded-lg bg-emerald-100 px-3 py-2 text-sm font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              <Sparkles className="h-4 w-4" />
              {isRefund
                ? "Refund submitted successfully."
                : claimResult?.mode === "lit"
                  ? "Claim submitted with Lit verification."
                  : "Claim submitted with on-chain verification."}
            </p>
          ) : (
            <button
              type="button"
              disabled={stage !== "ready"}
              onClick={submitClaim}
              className="w-full rounded-lg bg-indigo-500 px-4 py-3 text-sm font-semibold text-white transition hover:scale-[1.02] hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isRefund ? "CLAIM REFUND TO WALLET" : "CLAIM TO WALLET"}
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
