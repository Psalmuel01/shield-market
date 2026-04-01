"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertCircle,
  ChevronRight,
  Clock3,
  Coins,
  FileText,
  Gavel,
  Info,
  ShieldCheck,
  Sparkles,
  Wallet
} from "lucide-react";
import { formatEther, formatUnits, getAddress, parseEther, parseUnits } from "viem";
import {
  useAccount,
  useBalance,
  usePublicClient,
  useReadContract,
  useWalletClient,
  useWriteContract
} from "wagmi";
import { ActionSuccessModal, type ActionSuccessState } from "@/components/action-success-modal";
import { BetPlacement } from "@/components/bet-placement";
import { EncryptedActivity } from "@/components/encrypted-activity";
import { MarketLifecycle } from "@/components/market-lifecycle";
import { RuntimeAlerts } from "@/components/runtime-alerts";
import { erc20Abi } from "@/lib/abi";
import { shieldBetConfig } from "@/lib/contract";
import { decryptUserHandles, encryptBetInputs } from "@/lib/encryption";
import { formatDeadline, getCountdown, truncateErrorMessage } from "@/lib/format";
import { decodeMarketDetails, decodeMarketView } from "@/lib/market-contract";
import { getMarketAsset, getMarketStatus, getMarketStatusBlurb, getMarketType } from "@/lib/market-ui";
import { getRuntimeDiagnostics } from "@/lib/runtime-config";
import { logError } from "@/lib/telemetry";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

function statusClass(status: string) {
  if (status === "Active") return "border-emerald-400/20 bg-emerald-400/10 text-emerald-300";
  if (status === "Expired") return "border-amber-400/20 bg-amber-400/10 text-amber-300";
  if (status === "Proposed") return "border-blue-400/20 bg-blue-400/10 text-blue-300";
  if (status === "Disputed") return "border-rose-400/20 bg-rose-400/10 text-rose-300";
  return "border-white/10 bg-white/6 text-white/72";
}

export default function MarketDetailPage() {
  const params = useParams<{ id: string }>();
  const marketId = useMemo(() => BigInt(params?.id || "0"), [params?.id]);

  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { writeContractAsync } = useWriteContract();
  const diagnostics = useMemo(() => getRuntimeDiagnostics(), []);

  const [selectedOutcome, setSelectedOutcome] = useState(0);
  const [amount, setAmount] = useState("0.1");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isErrorMessage, setIsErrorMessage] = useState(false);
  const [successState, setSuccessState] = useState<ActionSuccessState | null>(null);
  const [isBetting, setIsBetting] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptedPosition, setDecryptedPosition] = useState<number | null>(null);
  const [positionRecoveryError, setPositionRecoveryError] = useState<string | null>(null);
  const [winningTotalInput, setWinningTotalInput] = useState("");
  const [disputedOutcomeInput, setDisputedOutcomeInput] = useState("0");
  const [isOpenSettlementSubmitting, setIsOpenSettlementSubmitting] = useState(false);
  const [isPublishingWinningTotal, setIsPublishingWinningTotal] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);

  const { data: marketData, refetch: refetchMarket } = useReadContract({
    ...shieldBetConfig,
    functionName: "markets",
    args: [marketId]
  });

  const { data: detailsData } = useReadContract({
    ...shieldBetConfig,
    functionName: "getMarketDetails",
    args: [marketId]
  });

  const { data: outcomeLabels } = useReadContract({
    ...shieldBetConfig,
    functionName: "getOutcomeLabels",
    args: [marketId]
  });

  const { data: totalPool, refetch: refetchTotalPool } = useReadContract({
    ...shieldBetConfig,
    functionName: "totalPool",
    args: [marketId]
  });

  const { data: owner } = useReadContract({
    ...shieldBetConfig,
    functionName: "owner"
  });

  const { data: oracleStake } = useReadContract({
    ...shieldBetConfig,
    functionName: "ORACLE_STAKE"
  });

  const { data: hasPosition, refetch: refetchHasPosition } = useReadContract({
    ...shieldBetConfig,
    functionName: "hasPosition",
    args: [marketId, address || ZERO_ADDRESS],
    query: { enabled: Boolean(address) }
  });

  const { data: myStakeAmount, refetch: refetchMyStakeAmount } = useReadContract({
    ...shieldBetConfig,
    functionName: "stakeAmounts",
    args: [marketId, address || ZERO_ADDRESS],
    query: { enabled: Boolean(address) }
  });

  const { data: hasClaimed, refetch: refetchHasClaimed } = useReadContract({
    ...shieldBetConfig,
    functionName: "hasClaimed",
    args: [marketId, address || ZERO_ADDRESS],
    query: { enabled: Boolean(address) }
  });

  const { data: myOutcomeHandle } = useReadContract({
    ...shieldBetConfig,
    functionName: "getBetOutcomeHandle",
    args: [marketId, address || ZERO_ADDRESS],
    query: { enabled: Boolean(address && hasPosition) }
  });

  const parsedMarket = useMemo(() => decodeMarketView(marketData), [marketData]);
  const parsedDetails = useMemo(() => decodeMarketDetails(detailsData), [detailsData]);
  const labels = useMemo(() => ((outcomeLabels as string[]) || ["YES", "NO"]).filter(Boolean), [outcomeLabels]);
  const assetLabel = useMemo(() => getMarketAsset(parsedMarket?.assetType ?? 0), [parsedMarket?.assetType]);
  const quoteToken = parsedMarket?.quoteToken || ZERO_ADDRESS;

  const { data: nativeBalance } = useBalance({ address, query: { enabled: Boolean(address && assetLabel === "ETH") } });
  const { data: tokenBalance } = useReadContract({
    address: quoteToken,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address || ZERO_ADDRESS],
    query: { enabled: Boolean(address && assetLabel === "USDC" && quoteToken !== ZERO_ADDRESS) }
  });
  const { data: tokenAllowance, refetch: refetchTokenAllowance } = useReadContract({
    address: quoteToken,
    abi: erc20Abi,
    functionName: "allowance",
    args: [address || ZERO_ADDRESS, shieldBetConfig.address],
    query: { enabled: Boolean(address && assetLabel === "USDC" && quoteToken !== ZERO_ADDRESS) }
  });
  const { data: tokenDecimals } = useReadContract({
    address: quoteToken,
    abi: erc20Abi,
    functionName: "decimals",
    query: { enabled: Boolean(assetLabel === "USDC" && quoteToken !== ZERO_ADDRESS) }
  });
  const { data: tokenSymbol } = useReadContract({
    address: quoteToken,
    abi: erc20Abi,
    functionName: "symbol",
    query: { enabled: Boolean(assetLabel === "USDC" && quoteToken !== ZERO_ADDRESS) }
  });

  const status = useMemo(() => {
    if (!parsedMarket) return "Active";
    return getMarketStatus(parsedMarket.status, parsedMarket.deadline);
  }, [parsedMarket]);

  const [hasRevealedPosition, setHasRevealedPosition] = useState(false);

  useEffect(() => {
    setDecryptedPosition(null);
    setPositionRecoveryError(null);
    setHasRevealedPosition(false);
  }, [marketId, myOutcomeHandle, address]);

  useEffect(() => {
    if (address && myOutcomeHandle && !hasRevealedPosition) {
      const storageKey = `revealed-${marketId}-${address}`;
      const hasRevealed = localStorage.getItem(storageKey) === 'true';
      if (hasRevealed) {
        revealPosition();
      }
    }
  }, [address, myOutcomeHandle, hasRevealedPosition, marketId]);

  async function revealPosition() {
    if (!myOutcomeHandle || !address || !walletClient) {
      setPositionRecoveryError("Missing position handle or wallet connection.");
      return;
    }

    setIsDecrypting(true);
    setPositionRecoveryError(null);
    try {
      const userAddress = address as `0x${string}`;
      const signer = walletClient;
      const result = await decryptUserHandles({
        contractAddress: shieldBetConfig.address,
        userAddress,
        walletClient: signer,
        handles: [myOutcomeHandle as `0x${string}`]
      });

      const decrypted = result[myOutcomeHandle as `0x${string}`];
      if (typeof decrypted === "number" || typeof decrypted === "bigint") {
        setDecryptedPosition(Number(decrypted));
        setPositionRecoveryError(null);
        setHasRevealedPosition(true);
        const storageKey = `revealed-${marketId}-${address}`;
        localStorage.setItem(storageKey, 'true');
      } else {
        throw new Error("Decrypted value unavailable");
      }
    } catch (error) {
      logError("market-detail", "failed to recover position", error);
      setPositionRecoveryError("Could not decrypt your position. Please try again.");
      setHasRevealedPosition(false);
    } finally {
      setIsDecrypting(false);
    }
  }

  if (!parsedMarket || !parsedDetails) {
    return (
      <div className="vm-card p-16 text-center">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
        <p className="mt-4 text-base font-semibold text-white/72">Loading market details...</p>
      </div>
    );
  }

  const marketType = getMarketType(parsedMarket.marketType);
  const statusBlurb = getMarketStatusBlurb(status);
  const isOwner = Boolean(address && owner && getAddress(address) === getAddress(owner as string));
  const isActive = status === "Active";
  const isExpired = status === "Expired";
  const isProposed = status === "Proposed";
  const isDisputed = status === "Disputed";
  const isFinalized = status === "Finalized";
  const currentOutcomeLabel = labels[parsedMarket.outcome] || `Outcome ${parsedMarket.outcome}`;
  const proposedOutcomeLabel = labels[parsedMarket.proposedOutcome] || `Outcome ${parsedMarket.proposedOutcome}`;
  const stakeWei = typeof myStakeAmount === "bigint" ? myStakeAmount : 0n;
  const winningTotalWei = parsedDetails.publishedWinningTotal;
  const totalPoolWei = typeof totalPool === "bigint" ? totalPool : 0n;
  const feeWei = (totalPoolWei * 500n) / 10_000n;
  const distributableWei = totalPoolWei - feeWei;
  const expectedPayoutWei =
    decryptedPosition !== null && decryptedPosition === parsedMarket.outcome && winningTotalWei > 0n
      ? (stakeWei * distributableWei) / winningTotalWei
      : 0n;
  const hasValidClaimQuote = expectedPayoutWei > 0n && expectedPayoutWei <= distributableWei;
  const canClaim =
    isFinalized &&
    parsedDetails.winningTotalIsPublished &&
    decryptedPosition === parsedMarket.outcome &&
    !hasClaimed &&
    hasValidClaimQuote;
  const balanceLabel = assetLabel === "ETH"
    ? `${Number(formatEther(nativeBalance?.value || 0n)).toFixed(4)} ETH`
    : `${Number(formatUnits((tokenBalance as bigint) || 0n, tokenDecimals || 6)).toFixed(2)} ${tokenSymbol || "USDC"}`;

  function parseStakeAmount() {
    return assetLabel === "ETH"
      ? parseEther(amount || "0")
      : parseUnits(amount || "0", tokenDecimals || 6);
  }

  function parseWinningTotalAmount() {
    return assetLabel === "ETH"
      ? parseEther(winningTotalInput || "0")
      : parseUnits(winningTotalInput || "0", tokenDecimals || 6);
  }

  async function onPlaceBet() {
    if (!address) {
      setStatusMessage("Connect your wallet first.");
      return;
    }

    setIsBetting(true);
    setStatusMessage("Preparing encrypted position...");
    setIsErrorMessage(false);
    try {
      const stakeAmount = parseStakeAmount();
      const encrypted = await encryptBetInputs(selectedOutcome, stakeAmount, {
        contractAddress: shieldBetConfig.address,
        userAddress: address
      });

      if (assetLabel === "USDC") {
        const allowance = (tokenAllowance as bigint) || 0n;
        if (allowance < stakeAmount) {
          setStatusMessage("Approving token spend...");
          setIsErrorMessage(false);
          const approveHash = await writeContractAsync({
            address: quoteToken,
            abi: erc20Abi,
            functionName: "approve",
            args: [shieldBetConfig.address, stakeAmount]
          });
          await publicClient?.waitForTransactionReceipt({ hash: approveHash });
          await refetchTokenAllowance();
        }
      }

      setStatusMessage("Check wallet to sign your bet...");
      setIsErrorMessage(false);
      const txHash = await writeContractAsync({
        ...shieldBetConfig,
        functionName: "placeBet",
        args: [marketId, encrypted.encOutcome, encrypted.inputProof, stakeAmount],
        value: assetLabel === "ETH" ? stakeAmount : 0n
      });
      await publicClient?.waitForTransactionReceipt({ hash: txHash });
      await Promise.all([refetchMarket(), refetchHasPosition(), refetchMyStakeAmount(), refetchTotalPool()]);
      setSuccessState({
        title: "Position placed successfully",
        description: `${amount} ${assetLabel} is now committed to ${labels[selectedOutcome]}. Your stake is public, but your selected side stays private to everyone else.`,
        txHash,
        primaryAction: { label: "Open My Bets", href: "/my-bets" },
        secondaryAction: { label: "Stay Here", variant: "secondary" }
      });
      setStatusMessage("Bet placed successfully.");
      setIsErrorMessage(false);
    } catch (error) {
      logError("market-detail", "bet failed", error);
      const errorMessage = error instanceof Error ? error.message : "Bet failed";
      setStatusMessage(truncateErrorMessage(errorMessage));
      setIsErrorMessage(true);
    } finally {
      setIsBetting(false);
    }
  }

  async function onPropose(outcomeIndex: number) {
    setStatusMessage("Submitting outcome proposal...");
    setIsErrorMessage(false);
    try {
      const txHash = await writeContractAsync({
        ...shieldBetConfig,
        functionName: "proposeOutcome",
        args: [marketId, outcomeIndex],
        value: oracleStake as bigint
      });
      await publicClient?.waitForTransactionReceipt({ hash: txHash });
      await refetchMarket();
      setSuccessState({
        title: "Resolution proposed",
        description: `${labels[outcomeIndex] || `Outcome ${outcomeIndex}`} has been proposed and the dispute window is now live.`,
        txHash,
        primaryAction: { label: "Continue" }
      });
      setStatusMessage("Outcome proposed.");
      setIsErrorMessage(false);
    } catch (error) {
      logError("market-detail", "propose failed", error);
      const errorMessage = error instanceof Error ? error.message : "Propose failed";
      setStatusMessage(truncateErrorMessage(errorMessage));
      setIsErrorMessage(true);
    }
  }

  async function onChallenge() {
    setStatusMessage("Submitting challenge...");
    setIsErrorMessage(false);
    try {
      const txHash = await writeContractAsync({
        ...shieldBetConfig,
        functionName: "challengeOutcome",
        args: [marketId],
        value: oracleStake as bigint
      });
      await publicClient?.waitForTransactionReceipt({ hash: txHash });
      await refetchMarket();
      setSuccessState({
        title: "Challenge submitted",
        description: "The proposed result has been challenged. This market is now in the dispute phase.",
        txHash,
        primaryAction: { label: "Continue" }
      });
      setStatusMessage("Challenge submitted.");
      setIsErrorMessage(false);
    } catch (error) {
      logError("market-detail", "challenge failed", error);
      const errorMessage = error instanceof Error ? error.message : "Challenge failed";
      setStatusMessage(truncateErrorMessage(errorMessage));
      setIsErrorMessage(true);
    }
  }

  async function onFinalizeUndisputed() {
    setStatusMessage("Finalizing undisputed market...");
    setIsErrorMessage(false);
    try {
      const txHash = await writeContractAsync({
        ...shieldBetConfig,
        functionName: "finalizeUndisputedOutcome",
        args: [marketId]
      });
      await publicClient?.waitForTransactionReceipt({ hash: txHash });
      await refetchMarket();
      setSuccessState({
        title: "Market finalized",
        description: "The market finalized without dispute. Open settlement totals and publish the winning total next.",
        txHash,
        primaryAction: { label: "Continue" }
      });
      setStatusMessage("Market finalized.");
      setIsErrorMessage(false);
    } catch (error) {
      logError("market-detail", "undisputed finalize failed", error);
      const errorMessage = error instanceof Error ? error.message : "Finalize failed";
      setStatusMessage(truncateErrorMessage(errorMessage));
      setIsErrorMessage(true);
    }
  }

  async function onFinalizeDisputed() {
    setStatusMessage("Finalizing disputed market...");
    setIsErrorMessage(false);
    try {
      const txHash = await writeContractAsync({
        ...shieldBetConfig,
        functionName: "finalizeDisputedOutcome",
        args: [marketId, Number(disputedOutcomeInput || 0)]
      });
      await publicClient?.waitForTransactionReceipt({ hash: txHash });
      await refetchMarket();
      setSuccessState({
        title: "Dispute finalized",
        description: "The disputed market has been adjudicated by the owner fallback flow.",
        txHash,
        primaryAction: { label: "Continue" }
      });
      setStatusMessage("Dispute finalized.");
      setIsErrorMessage(false);
    } catch (error) {
      logError("market-detail", "disputed finalize failed", error);
      const errorMessage = error instanceof Error ? error.message : "Disputed finalize failed";
      setStatusMessage(truncateErrorMessage(errorMessage));
      setIsErrorMessage(true);
    }
  }

  async function onOpenSettlementTotals() {
    setIsOpenSettlementSubmitting(true);
    setStatusMessage("Opening settlement totals...");
    setIsErrorMessage(false);
    try {
      const txHash = await writeContractAsync({
        ...shieldBetConfig,
        functionName: "openSettlementTotals",
        args: [marketId]
      });
      await publicClient?.waitForTransactionReceipt({ hash: txHash });
      await refetchMarket();
      setSuccessState({
        title: "Settlement totals opened",
        description: "Encrypted aggregate totals are now ready for public decryption and winning-total publication.",
        txHash,
        primaryAction: { label: "Continue" }
      });
      setStatusMessage("Settlement totals opened.");
      setIsErrorMessage(false);
    } catch (error) {
      logError("market-detail", "open settlement totals failed", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to open settlement totals";
      setStatusMessage(truncateErrorMessage(errorMessage));
      setIsErrorMessage(true);
    } finally {
      setIsOpenSettlementSubmitting(false);
    }
  }

  async function onPublishWinningTotal() {
    if (!winningTotalInput.trim()) {
      setStatusMessage(`Enter the total stake on the winning side in ${assetLabel}.`);
      return;
    }

    setIsPublishingWinningTotal(true);
    setStatusMessage("Publishing winning total...");
    try {
      const winningTotal = parseWinningTotalAmount();
      if (winningTotal <= 0n || winningTotal > totalPoolWei) {
        throw new Error("Winning total must be greater than zero and no larger than the full market pool.");
      }

      const txHash = await writeContractAsync({
        ...shieldBetConfig,
        functionName: "publishWinningTotal",
        args: [marketId, winningTotal]
      });
      await publicClient?.waitForTransactionReceipt({ hash: txHash });
      await refetchMarket();
      setSuccessState({
        title: "Winning total published",
        description: "The denominator for automatic claims is now anchored on-chain.",
        txHash,
        primaryAction: { label: "Continue" }
      });
      setStatusMessage("Winning total published.");
      setIsErrorMessage(false);
    } catch (error) {
      logError("market-detail", "publish winning total failed", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to publish winning total";
      setStatusMessage(truncateErrorMessage(errorMessage));
      setIsErrorMessage(true);
    } finally {
      setIsPublishingWinningTotal(false);
    }
  }

  async function onClaim() {
    if (!address) return;
    if (decryptedPosition === null) {
      setStatusMessage("Recover your local position first before claiming.");
      return;
    }

    setIsClaiming(true);
    setStatusMessage("Requesting claim attestation...");
    try {
      const attestResponse = await fetch("/api/claims/attest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketId: marketId.toString(),
          account: address,
          decryptedOutcome: decryptedPosition
        })
      });
      const attestation = await attestResponse.json();
      if (!attestResponse.ok) {
        throw new Error(attestation.error || "Failed to get claim attestation");
      }

      setStatusMessage("Submitting claim transaction...");
      const txHash = await writeContractAsync({
        ...shieldBetConfig,
        functionName: "claimWinningsWithAttestation",
        args: [
          marketId,
          attestation.resolvedOutcome,
          BigInt(attestation.winningTotal),
          BigInt(attestation.payoutDeadline),
          attestation.signature as `0x${string}`
        ]
      });
      const receipt = await publicClient?.waitForTransactionReceipt({ hash: txHash });

      let claimMessage = "Winnings claimed.";
      try {
        const verifyResponse = await fetch("/api/lit/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            marketId: marketId.toString(),
            txHash,
            account: address,
            expectedPayoutWei: attestation.expectedPayoutWei,
            resolvedOutcome: String(attestation.resolvedOutcome)
          })
        });
        if (verifyResponse.ok) {
          claimMessage = "Winnings claimed. Lit verification completed.";
        }
      } catch {
        claimMessage = "Winnings claimed. Lit verification was unavailable.";
      }

      if (receipt?.status === "success") {
        setStatusMessage(claimMessage);
      }

      await Promise.all([refetchHasClaimed(), refetchMyStakeAmount(), refetchTotalPool()]);
      setSuccessState({
        title: "Claim completed",
        description: `${assetLabel} winnings were released to your wallet.${claimMessage.includes("Lit verification completed") ? " Lit verification also completed successfully." : ""}`,
        txHash,
        primaryAction: { label: "Open My Bets", href: "/my-bets" },
        secondaryAction: { label: "Stay Here", variant: "secondary" }
      });
    } catch (error) {
      logError("market-detail", "claim failed", error);
      const errorMessage = error instanceof Error ? error.message : "Claim failed";
      setStatusMessage(truncateErrorMessage(errorMessage));
      setIsErrorMessage(true);
    } finally {
      setIsClaiming(false);
    }
  }

  return (
    <section className="vm-page page-enter">
      <RuntimeAlerts diagnostics={diagnostics} />
      <ActionSuccessModal open={Boolean(successState)} state={successState} onClose={() => setSuccessState(null)} />

      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
        <Link href="/markets" className="transition hover:text-[var(--primary)]">Markets</Link>
        <ChevronRight className="h-3 w-3" />
        <span>{parsedDetails.category || "General"}</span>
        <ChevronRight className="h-3 w-3" />
        <span>Market #{marketId.toString()}</span>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <div className="vm-hero">
            <div className="vm-page-header">
              <div>
                <div className="vm-page-header__meta">
                  <span className="vm-category-pill border-white/8 bg-white/4 text-white/72">{parsedDetails.category || "General"}</span>
                  <span className="vm-category-pill border-white/8 bg-white/4 text-white/72">{marketType}</span>
                  <span className="vm-category-pill border-white/8 bg-white/4 text-white/72">{assetLabel}</span>
                  <span className={`vm-status-pill ${statusClass(status)}`}>{status}</span>
                </div>
                <h1 className="vm-page-title mt-5 text-[2.2rem] md:text-[2.8rem]">{parsedMarket.question}</h1>
                <p className="mt-4 max-w-3xl text-base leading-8 text-white/62">{parsedDetails.resolutionCriteria}</p>
              </div>

              <div className="rounded-[1.5rem] border border-white/6 bg-white/[0.03] p-5 lg:min-w-[18rem]">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--primary)]">Market timing</div>
                <div className="mt-4 flex items-center gap-3 text-sm font-semibold text-white/82">
                  <Clock3 className="h-4 w-4 text-[var(--primary)]" />
                  {isActive ? getCountdown(parsedMarket.deadline) : formatDeadline(parsedMarket.deadline)}
                </div>
                <div className="mt-4 text-xs leading-7 text-white/55">Deadline: {formatDeadline(parsedMarket.deadline)}</div>
              </div>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-4">
              <div className="vm-stat-card">
                <div className="vm-stat-card__label">Pool</div>
                <div className="vm-stat-card__value">{assetLabel === "ETH" ? `${Number(formatEther(totalPoolWei)).toFixed(4)} ETH` : `${Number(formatUnits(totalPoolWei, tokenDecimals || 6)).toFixed(2)} ${tokenSymbol || "USDC"}`}</div>
                <div className="vm-stat-card__hint">Public stake pool</div>
              </div>
              <div className="vm-stat-card">
                <div className="vm-stat-card__label">Min Stake</div>
                <div className="vm-stat-card__value">{assetLabel === "ETH" ? `${Number(formatEther(parsedMarket.minStake)).toFixed(4)} ETH` : `${Number(formatUnits(parsedMarket.minStake, tokenDecimals || 6)).toFixed(2)} ${tokenSymbol || "USDC"}`}</div>
                <div className="vm-stat-card__hint">Market threshold</div>
              </div>
              <div className="vm-stat-card">
                <div className="vm-stat-card__label">Distributable Pool</div>
                <div className="vm-stat-card__value">{assetLabel === "ETH" ? `${Number(formatEther(distributableWei)).toFixed(4)} ETH` : `${Number(formatUnits(distributableWei, tokenDecimals || 6)).toFixed(2)} ${tokenSymbol || "USDC"}`}</div>
                <div className="vm-stat-card__hint">Pool after protocol fee</div>
              </div>
              <div className="vm-stat-card">
                <div className="vm-stat-card__label">Winning Total</div>
                <div className="vm-stat-card__value">{parsedDetails.winningTotalIsPublished ? (assetLabel === "ETH" ? `${Number(formatEther(winningTotalWei)).toFixed(4)} ETH` : `${Number(formatUnits(winningTotalWei, tokenDecimals || 6)).toFixed(2)} ${tokenSymbol || "USDC"}`) : "Pending"}</div>
                <div className="vm-stat-card__hint">Published settlement denominator</div>
              </div>
            </div>
          </div>

          <div className="vm-card p-6 md:p-7">
            <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--primary)]">
              <Info className="h-4 w-4" />
              Market Lifecycle
            </div>
            <p className="mt-4 text-sm leading-8 text-white/68">{statusBlurb}</p>
            <div className="mt-5"><MarketLifecycle currentStatus={status} /></div>
            <div className="mt-6 flex flex-wrap gap-3">
              <span className="vm-category-pill border-white/8 bg-white/4 text-white/72">
                <ShieldCheck className="h-3.5 w-3.5 text-[var(--success)]" />
                {parsedDetails.resolutionPolicy}
              </span>
              <span className="vm-category-pill border-white/8 bg-white/4 text-white/72">
                <FileText className="h-3.5 w-3.5 text-[var(--accent)]" />
                Source: {parsedDetails.resolutionSource}
              </span>
            </div>
          </div>

          {(isExpired || isProposed || isDisputed || isFinalized) ? (
            <div className="vm-card overflow-hidden bg-[linear-gradient(135deg,rgba(108,142,255,0.14),rgba(0,228,180,0.06))] p-6 md:p-7">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--primary)]">Resolution Desk</div>
                  <h2 className="font-display mt-2 text-2xl font-bold text-white">Oracle and settlement flow</h2>
                </div>
                <Gavel className="h-8 w-8 text-white/25" />
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-[1.5rem] border border-white/8 bg-black/20 p-5 space-y-3">
                  {isExpired ? (
                    <>
                      <p className="text-sm leading-7 text-white/68">The market has expired. Anyone can propose the winning outcome by staking {oracleStake ? Number(formatEther(oracleStake)).toFixed(2) : "0.01"} ETH.</p>
                      <div className="grid gap-2">
                        {labels.map((label, index) => (
                          <button key={`${label}-${index}`} type="button" onClick={() => onPropose(index)} className="vm-secondary-btn justify-center">Propose {label}</button>
                        ))}
                      </div>
                    </>
                  ) : null}

                  {isProposed ? (
                    <>
                      <p className="text-sm leading-7 text-white/68">Proposed outcome: {proposedOutcomeLabel}</p>
                      <div className="rounded-[1.2rem] border border-white/8 bg-white/[0.04] p-4">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Dispute window</div>
                        <div className="mt-3 text-lg font-bold text-white">{getCountdown(parsedMarket.disputeWindowEnd)}</div>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <button type="button" onClick={onChallenge} className="vm-secondary-btn justify-center">
                          <AlertCircle className="h-4 w-4" />Challenge
                        </button>
                        <button
                          type="button"
                          onClick={onFinalizeUndisputed}
                          disabled={Number(parsedMarket.disputeWindowEnd) * 1000 > Date.now()}
                          className="vm-primary-btn justify-center disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Finalize Undisputed
                        </button>
                      </div>
                    </>
                  ) : null}

                  {isDisputed ? (
                    <>
                      <p className="text-sm leading-7 text-white/68">The proposal was challenged. The owner can now apply the fallback adjudication after the dispute window ends.</p>
                      {isOwner ? (
                        <>
                          <input value={disputedOutcomeInput} onChange={(event) => setDisputedOutcomeInput(event.target.value)} className="vm-input" placeholder="Final outcome index" />
                          <button
                            type="button"
                            onClick={onFinalizeDisputed}
                            disabled={Number(parsedMarket.disputeWindowEnd) * 1000 > Date.now()}
                            className="vm-primary-btn justify-center disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Finalize Dispute
                          </button>
                        </>
                      ) : null}
                    </>
                  ) : null}

                  {isFinalized ? (
                    <div className="rounded-[1.25rem] border border-emerald-400/18 bg-emerald-400/10 p-4">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">Official result</div>
                      <div className="font-display mt-2 text-2xl font-bold text-white">{currentOutcomeLabel}</div>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-[1.5rem] border border-white/8 bg-black/20 p-5 space-y-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Settlement</div>
                    <p className="mt-3 text-sm leading-7 text-white/68">Finalized markets first open encrypted aggregate totals, then publish the winning total, then winners claim automatically with an attested authorization.</p>
                  </div>
                  {isFinalized ? (
                    <>
                      <button type="button" onClick={onOpenSettlementTotals} disabled={isOpenSettlementSubmitting || parsedDetails.totalsOpened} className="vm-secondary-btn justify-center disabled:cursor-not-allowed disabled:opacity-50">
                        {parsedDetails.totalsOpened ? "Settlement Totals Opened" : isOpenSettlementSubmitting ? "Opening..." : "Open Settlement Totals"}
                      </button>
                      {(isOwner || (address && owner && getAddress(address) === getAddress(owner as string))) ? (
                        <>
                          <input value={winningTotalInput} onChange={(event) => setWinningTotalInput(event.target.value)} className="vm-input" placeholder={assetLabel === "ETH" ? "e.g. 1.25" : "e.g. 150"} />
                          <p className="text-xs leading-6 text-white/55">
                            Enter the full stake on the winning side in normal {assetLabel} units, not raw wei/base units.
                          </p>
                          <button type="button" onClick={onPublishWinningTotal} disabled={isPublishingWinningTotal || !parsedDetails.totalsOpened} className="vm-primary-btn justify-center disabled:cursor-not-allowed disabled:opacity-50">
                            {isPublishingWinningTotal ? "Publishing..." : parsedDetails.winningTotalIsPublished ? "Winning Total Published" : "Publish Winning Total"}
                          </button>
                        </>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-6">
          <BetPlacement
            selectedOutcome={selectedOutcome}
            outcomeLabels={labels}
            amount={amount}
            assetLabel={assetLabel}
            balanceLabel={balanceLabel}
            alreadyBet={Boolean(hasPosition) || !isActive}
            isSubmitting={isBetting}
            submitLabel={isActive ? `Place ${assetLabel} Bet` : isFinalized ? "Market Finalized" : "Betting Closed"}
            statusHint={assetLabel === "ETH" ? "Your stake amount is public, but your selected side is encrypted before it reaches the chain." : "USDC stake is transferred on-chain while your selected outcome stays encrypted via fhEVM."}
            onSelectOutcome={setSelectedOutcome}
            onAmountChange={setAmount}
            onMax={() => {
              if (assetLabel === "ETH") setAmount(formatEther(nativeBalance?.value || 0n));
              else setAmount(formatUnits((tokenBalance as bigint) || 0n, tokenDecimals || 6));
            }}
            onSubmit={onPlaceBet}
          />

          <div className="vm-card space-y-3 p-6 md:p-7">
            <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--primary)]">
              <Wallet className="h-4 w-4" />
              Your Position
            </div>
            {!address ? (
              <p className="text-sm leading-7 text-white/62">Connect your wallet to recover your local side, stake, and claim status.</p>
            ) : (
              <div className="space-y-3 text-sm text-white/72">
                <div className="flex items-center justify-between rounded-[1rem] border border-white/6 bg-white/[0.03] px-4 py-3">
                  <span>Recovered side</span>
                  <span className="font-semibold text-white">
                    {decryptedPosition !== null
                      ? status === "Finalized"
                        ? decryptedPosition === parsedMarket.outcome
                          ? "WON"
                          : "LOST"
                        : labels[decryptedPosition]
                      : positionRecoveryError
                        ? "Unavailable"
                        : isDecrypting
                          ? "Recovering..."
                          : hasRevealedPosition
                            ? "Not found"
                            : "Encrypted"}
                  </span>
                </div>
                {!decryptedPosition && !isDecrypting && !hasRevealedPosition ? (
                  <button
                    type="button"
                    onClick={revealPosition}
                    className="vm-secondary-btn w-full justify-center"
                  >
                    Reveal my position
                  </button>
                ) : null}
                {positionRecoveryError ? <p className="text-red-300">{positionRecoveryError}</p> : null}

                <div className="flex items-center justify-between rounded-[1rem] border border-white/6 bg-white/[0.03] px-4 py-3">
                  <span>Stake</span>
                  <span className="font-semibold text-white">{assetLabel === "ETH" ? `${Number(formatEther(stakeWei)).toFixed(4)} ETH` : `${Number(formatUnits(stakeWei, tokenDecimals || 6)).toFixed(2)} ${tokenSymbol || "USDC"}`}</span>
                </div>
                <div className="flex items-center justify-between rounded-[1rem] border border-white/6 bg-white/[0.03] px-4 py-3">
                  <span>Claim state</span>
                  <span className="font-semibold text-white">{hasClaimed ? "Claimed" : canClaim ? "Ready to claim" : isFinalized && decryptedPosition !== null && decryptedPosition !== parsedMarket.outcome ? "Lost" : "Pending"}</span>
                </div>
                {expectedPayoutWei > 0n ? (
                  <div className="rounded-[1rem] border border-emerald-400/18 bg-emerald-400/10 px-4 py-3 text-emerald-300">
                    Expected payout: {assetLabel === "ETH" ? `${Number(formatEther(expectedPayoutWei)).toFixed(4)} ETH` : `${Number(formatUnits(expectedPayoutWei, tokenDecimals || 6)).toFixed(2)} ${tokenSymbol || "USDC"}`}
                  </div>
                ) : null}
                {parsedDetails.winningTotalIsPublished && decryptedPosition === parsedMarket.outcome && !hasValidClaimQuote ? (
                  <div className="rounded-[1rem] border border-amber-400/18 bg-amber-400/10 px-4 py-3 text-amber-200">
                    The published winning total looks inconsistent with your stake. Re-open settlement and publish the correct total before claiming.
                  </div>
                ) : null}
                {canClaim ? (
                  <button type="button" onClick={onClaim} disabled={isClaiming} className="vm-primary-btn w-full justify-center disabled:cursor-not-allowed disabled:opacity-50">
                    <Sparkles className="h-4 w-4" />
                    {isClaiming ? "Claiming..." : `Claim ${assetLabel} Rewards`}
                  </button>
                ) : null}
              </div>
            )}
          </div>

          <div className="vm-card p-6 md:p-7">
            <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--primary)]">
              <Coins className="h-4 w-4" />
              Market Notes
            </div>
            <div className="mt-4 space-y-3 text-sm leading-7 text-white/68">
              <p>Resolution policy: {parsedDetails.resolutionPolicy}</p>
              <p>Resolution source: {parsedDetails.resolutionSource}</p>
              {parsedDetails.quoteToken !== ZERO_ADDRESS ? <p>Quote token: {parsedDetails.quoteToken}</p> : null}
              {parsedMarket.publishedWinningTotal > 0n ? <p>Published winning total: {parsedMarket.publishedWinningTotal.toString()}</p> : null}
              {statusMessage ? (
                <p className={isErrorMessage ? "text-red-300" : "text-[var(--primary)]"}>
                  {statusMessage}
                </p>
              ) : null}
            </div>
          </div>

          <EncryptedActivity marketId={marketId} />
        </div>
      </div>
    </section>
  );
}
