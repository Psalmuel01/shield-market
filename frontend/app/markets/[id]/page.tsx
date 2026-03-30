"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  ChevronRight,
  Clock3,
  ExternalLink,
  FileText,
  Gavel,
  History,
  Info,
  ShieldCheck,
  TrendingUp,
  Wallet
} from "lucide-react";
import { formatEther, getAddress, parseEther } from "viem";
import {
  useAccount,
  useBalance,
  usePublicClient,
  useReadContract,
  useWalletClient,
  useWriteContract
} from "wagmi";
import { BetPlacement } from "@/components/bet-placement";
import { EncryptedActivity } from "@/components/encrypted-activity";
import { RuntimeAlerts } from "@/components/runtime-alerts";
import { encryptBetInputs, decryptUserHandles } from "@/lib/encryption";
import { cidToExplorer, formatDeadline, getCountdown } from "@/lib/format";
import { shieldBetConfig } from "@/lib/contract";
import { decodeMarketDetails, decodeMarketView } from "@/lib/market-contract";
import { getMarketStatus, getMarketType } from "@/lib/market-ui";
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

  const [selectedOutcome, setSelectedOutcome] = useState(0);
  const [amount, setAmount] = useState("0.01");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isBetting, setIsBetting] = useState(false);
  const [decryptedPosition, setDecryptedPosition] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [settlementAddresses, setSettlementAddresses] = useState("");
  const [winnerAddress, setWinnerAddress] = useState("");
  const [manualPayoutEth, setManualPayoutEth] = useState("");
  const [isOpeningSettlement, setIsOpeningSettlement] = useState(false);
  const [isAssigningPayout, setIsAssigningPayout] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);

  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { data: balance } = useBalance({ address });
  const { writeContractAsync } = useWriteContract();
  const diagnostics = useMemo(() => getRuntimeDiagnostics(), []);

  const { data: marketData, refetch: refetchMarket } = useReadContract({
    ...shieldBetConfig,
    functionName: "markets",
    args: [marketId]
  });

  const { data: metadataCid } = useReadContract({
    ...shieldBetConfig,
    functionName: "marketMetadataCID",
    args: [marketId]
  });

  const { data: outcomeLabels } = useReadContract({
    ...shieldBetConfig,
    functionName: "getOutcomeLabels",
    args: [marketId]
  });

  const { data: marketDetailsData } = useReadContract({
    ...shieldBetConfig,
    functionName: "getMarketDetails",
    args: [marketId]
  });

  const { data: marketPoolBalance } = useReadContract({
    ...shieldBetConfig,
    functionName: "marketPoolBalance",
    args: [marketId]
  });

  const { data: oracleStake } = useReadContract({
    ...shieldBetConfig,
    functionName: "ORACLE_STAKE"
  });

  const { data: contractOwner } = useReadContract({
    ...shieldBetConfig,
    functionName: "owner"
  });

  const { data: hasPosition } = useReadContract({
    ...shieldBetConfig,
    functionName: "hasPosition",
    args: [marketId, address || ZERO_ADDRESS],
    query: { enabled: Boolean(address) }
  });

  const { data: myOutcomeHandle } = useReadContract({
    ...shieldBetConfig,
    functionName: "getMyOutcome",
    args: [marketId],
    account: address,
    query: { enabled: Boolean(address && hasPosition) }
  });

  const { data: claimablePayout, refetch: refetchClaimablePayout } = useReadContract({
    ...shieldBetConfig,
    functionName: "claimablePayouts",
    args: [marketId, address || ZERO_ADDRESS],
    query: { enabled: Boolean(address) }
  });

  const { data: hasClaimed } = useReadContract({
    ...shieldBetConfig,
    functionName: "hasClaimed",
    args: [marketId, address || ZERO_ADDRESS],
    query: { enabled: Boolean(address) }
  });

  const parsedMarket = useMemo(() => decodeMarketView(marketData), [marketData]);
  const parsedDetails = useMemo(() => decodeMarketDetails(marketDetailsData), [marketDetailsData]);
  const labels = useMemo(() => ((outcomeLabels as string[]) || ["YES", "NO"]).filter(Boolean), [outcomeLabels]);

  const status = useMemo(() => {
    if (!parsedMarket) return "Active";
    return getMarketStatus(parsedMarket.status, parsedMarket.deadline);
  }, [parsedMarket]);

  const marketType = useMemo(() => {
    if (!parsedMarket) return "Binary";
    return getMarketType(parsedMarket.marketType);
  }, [parsedMarket]);

  useEffect(() => {
    if (!myOutcomeHandle || !address || !walletClient || decryptedPosition !== null || isDecrypting) return;

    let cancelled = false;

    async function decryptPosition() {
      setIsDecrypting(true);
      try {
        const userAddress = address as `0x${string}`;
        const signer = walletClient!;
        const result = await decryptUserHandles({
          contractAddress: shieldBetConfig.address,
          userAddress,
          walletClient: signer,
          handles: [myOutcomeHandle as `0x${string}`]
        });

        if (!cancelled) {
          setDecryptedPosition(Number(result[myOutcomeHandle as `0x${string}`]));
        }
      } catch (error) {
        logError("market-detail", "decryption failed", error);
      } finally {
        if (!cancelled) setIsDecrypting(false);
      }
    }

    void decryptPosition();
    return () => {
      cancelled = true;
    };
  }, [address, decryptedPosition, isDecrypting, myOutcomeHandle, walletClient]);

  async function onPlaceBet() {
    if (!address) {
      setStatusMessage("Connect wallet first");
      return;
    }

    setIsBetting(true);
    setStatusMessage("Preparing confidential payload...");

    try {
      const amountWei = parseEther(amount);
      const encrypted = await encryptBetInputs(selectedOutcome, amountWei, {
        contractAddress: shieldBetConfig.address,
        userAddress: address
      });

      setStatusMessage("Check wallet to sign...");
      const txHash = await writeContractAsync({
        ...shieldBetConfig,
        functionName: "placeBet",
        args: [marketId, encrypted.encOutcome, encrypted.inputProof],
        value: amountWei
      });

      setStatusMessage("Confirming on-chain...");
      await publicClient?.waitForTransactionReceipt({ hash: txHash });
      setStatusMessage("Bet placed successfully.");
      await refetchMarket();
    } catch (error) {
      logError("market-detail", "bet failed", error);
      setStatusMessage(error instanceof Error ? error.message : "Bet failed");
    } finally {
      setIsBetting(false);
    }
  }

  async function onPropose(outcomeIdx: number) {
    if (!address) return;
    setStatusMessage("Proposing outcome...");
    try {
      const txHash = await writeContractAsync({
        ...shieldBetConfig,
        functionName: "proposeOutcome",
        args: [marketId, outcomeIdx],
        value: oracleStake as bigint
      });
      await publicClient?.waitForTransactionReceipt({ hash: txHash });
      setStatusMessage("Outcome proposed.");
      await refetchMarket();
    } catch (error) {
      logError("market-detail", "propose failed", error);
      setStatusMessage(error instanceof Error ? error.message : "Propose failed");
    }
  }

  async function onChallenge() {
    if (!address) return;
    setStatusMessage("Challenging outcome...");
    try {
      const txHash = await writeContractAsync({
        ...shieldBetConfig,
        functionName: "challengeOutcome",
        args: [marketId],
        value: oracleStake as bigint
      });
      await publicClient?.waitForTransactionReceipt({ hash: txHash });
      setStatusMessage("Challenge submitted.");
      await refetchMarket();
    } catch (error) {
      logError("market-detail", "challenge failed", error);
      setStatusMessage(error instanceof Error ? error.message : "Challenge failed");
    }
  }

  async function onFinalize() {
    if (!address) return;
    setStatusMessage("Finalizing market...");
    try {
      const txHash = await writeContractAsync({
        ...shieldBetConfig,
        functionName: "finalizeOutcome",
        args: [marketId, Number(parsedMarket?.proposedOutcome || 0)]
      });
      await publicClient?.waitForTransactionReceipt({ hash: txHash });
      setStatusMessage("Market finalized.");
      await refetchMarket();
    } catch (error) {
      logError("market-detail", "finalize failed", error);
      setStatusMessage(error instanceof Error ? error.message : "Finalize failed");
    }
  }

  async function onClaim() {
    if (!address) return;
    setIsClaiming(true);
    setStatusMessage("Claiming winnings...");
    try {
      const txHash = await writeContractAsync({
        ...shieldBetConfig,
        functionName: "claimWinnings",
        args: [marketId]
      });
      const receipt = await publicClient?.waitForTransactionReceipt({ hash: txHash });

      let claimMessage = "Winnings claimed.";
      try {
        const response = await fetch("/api/lit/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            marketId: marketId.toString(),
            txHash,
            account: address,
            expectedPayoutWei: (claimablePayout || 0n).toString()
          })
        });

        if (response.ok) {
          claimMessage = "Winnings claimed. Lit verification completed.";
        } else {
          claimMessage = "Winnings claimed. Lit verification was unavailable.";
        }
      } catch {
        claimMessage = "Winnings claimed. Lit verification was unavailable.";
      }

      if (receipt?.status === "success") {
        setStatusMessage(claimMessage);
      }
      await Promise.all([refetchMarket(), refetchClaimablePayout()]);
    } catch (error) {
      logError("market-detail", "claim failed", error);
      setStatusMessage(error instanceof Error ? error.message : "Claim failed");
    } finally {
      setIsClaiming(false);
    }
  }

  async function onOpenSettlementData() {
    if (!settlementAddresses.trim()) {
      setStatusMessage("Add at least one bettor address to open settlement data.");
      return;
    }

    let bettors: `0x${string}`[];
    try {
      bettors = Array.from(
        new Set(
          settlementAddresses
            .split(/[\s,]+/)
            .map((value) => value.trim())
            .filter(Boolean)
            .map((value) => getAddress(value))
        )
      ) as `0x${string}`[];
    } catch {
      setStatusMessage("One or more settlement addresses are invalid.");
      return;
    }

    if (!bettors.length) {
      setStatusMessage("Add at least one bettor address to open settlement data.");
      return;
    }

    setIsOpeningSettlement(true);
    setStatusMessage("Opening settlement data...");
    try {
      const txHash = await writeContractAsync({
        ...shieldBetConfig,
        functionName: "openSettlementData",
        args: [marketId, bettors]
      });
      await publicClient?.waitForTransactionReceipt({ hash: txHash });
      setStatusMessage("Settlement data opened.");
      await refetchMarket();
    } catch (error) {
      logError("market-detail", "open settlement failed", error);
      setStatusMessage(error instanceof Error ? error.message : "Failed to open settlement data");
    } finally {
      setIsOpeningSettlement(false);
    }
  }

  async function onAssignPayout() {
    if (!winnerAddress.trim() || !manualPayoutEth.trim()) {
      setStatusMessage("Enter a winner address and payout amount.");
      return;
    }

    setIsAssigningPayout(true);
    setStatusMessage("Assigning payout...");
    try {
      const txHash = await writeContractAsync({
        ...shieldBetConfig,
        functionName: "assignPayoutManual",
        args: [marketId, getAddress(winnerAddress.trim()), parseEther(manualPayoutEth)]
      });
      await publicClient?.waitForTransactionReceipt({ hash: txHash });
      setStatusMessage("Payout assigned.");
      await refetchClaimablePayout();
    } catch (error) {
      logError("market-detail", "assign payout failed", error);
      setStatusMessage(error instanceof Error ? error.message : "Failed to assign payout");
    } finally {
      setIsAssigningPayout(false);
    }
  }

  if (!parsedMarket) {
    return (
      <div className="vm-card p-16 text-center">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
        <p className="mt-4 text-base font-semibold text-white/72">Loading market details...</p>
      </div>
    );
  }

  const isExpired = status === "Expired";
  const isProposed = status === "Proposed";
  const isDisputed = status === "Disputed";
  const isFinalized = status === "Finalized";
  const isActive = status === "Active";
  const isOwner = address && contractOwner ? getAddress(address) === getAddress(contractOwner as string) : false;
  const currentOutcomeLabel =
    parsedMarket.outcome < labels.length ? labels[parsedMarket.outcome] : `Outcome ${parsedMarket.outcome}`;
  const proposedOutcomeLabel =
    parsedMarket.proposedOutcome < labels.length ? labels[parsedMarket.proposedOutcome] : `Outcome ${parsedMarket.proposedOutcome}`;
  const claimablePayoutWei = typeof claimablePayout === "bigint" ? claimablePayout : 0n;
  const canClaim = isFinalized && claimablePayoutWei > 0n && !hasClaimed;

  return (
    <section className="vm-page page-enter">
      <RuntimeAlerts diagnostics={diagnostics} />

      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
        <Link href="/markets" className="transition hover:text-[var(--primary)]">
          Markets
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span>{parsedDetails?.category || "General"}</span>
        <ChevronRight className="h-3 w-3" />
        <span>Market #{marketId.toString()}</span>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <div className="vm-hero">
            <div className="vm-page-header">
              <div>
                <div className="vm-page-header__meta">
                  <span className="vm-category-pill border-white/8 bg-white/4 text-white/72">{parsedDetails?.category || "General"}</span>
                  <span className="vm-category-pill border-white/8 bg-white/4 text-white/72">{marketType}</span>
                  <span className={`vm-status-pill ${statusClass(status)}`}>{status}</span>
                </div>
                <h1 className="vm-page-title mt-5 text-[2.2rem] md:text-[2.8rem]">{parsedMarket.question}</h1>
                <p className="mt-4 max-w-3xl text-base leading-8 text-white/62">
                  {parsedDetails?.resolutionCriteria || "This market resolves according to the criteria defined at creation time."}
                </p>
              </div>

              <div className="rounded-[1.5rem] border border-white/6 bg-white/[0.03] p-5 lg:min-w-[18rem]">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--primary)]">Market timing</div>
                <div className="mt-4 flex items-center gap-3 text-sm font-semibold text-white/82">
                  <Clock3 className="h-4 w-4 text-[var(--primary)]" />
                  {isActive ? getCountdown(parsedMarket.deadline) : formatDeadline(parsedMarket.deadline)}
                </div>
                <div className="mt-4 text-xs leading-7 text-white/55">
                  Deadline: {formatDeadline(parsedMarket.deadline)}
                </div>
              </div>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-4">
              <div className="vm-stat-card">
                <div className="vm-stat-card__label">Pool</div>
                <div className="vm-stat-card__value">{Number(formatEther(marketPoolBalance || 0n)).toFixed(4)} ETH</div>
                <div className="vm-stat-card__hint">Public stake escrow</div>
              </div>
              <div className="vm-stat-card">
                <div className="vm-stat-card__label">Creator</div>
                <div className="vm-stat-card__value font-mono text-xl">{parsedMarket.creator.slice(0, 6)}...</div>
                <div className="vm-stat-card__hint">On-chain market author</div>
              </div>
              <div className="vm-stat-card">
                <div className="vm-stat-card__label">Resolution Source</div>
                <div className="vm-stat-card__value text-xl">{parsedDetails?.resolutionSource || "Web"}</div>
                <div className="vm-stat-card__hint">Declared authority</div>
              </div>
              <div className="vm-stat-card">
                <div className="vm-stat-card__label">Current Result</div>
                <div className="vm-stat-card__value text-xl">{isFinalized ? currentOutcomeLabel : "Pending"}</div>
                <div className="vm-stat-card__hint">Official market state</div>
              </div>
            </div>
          </div>

          <div className="vm-card p-6 md:p-7">
            <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--primary)]">
              <Info className="h-4 w-4" />
              Resolution Criteria
            </div>
            <p className="mt-4 text-sm leading-8 text-white/68">
              {parsedDetails?.resolutionCriteria || "The market resolves based on the criteria specified at creation time."}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <span className="vm-category-pill border-white/8 bg-white/4 text-white/72">
                <ShieldCheck className="h-3.5 w-3.5 text-[var(--success)]" />
                Optimistic oracle
              </span>
              <span className="vm-category-pill border-white/8 bg-white/4 text-white/72">
                <FileText className="h-3.5 w-3.5 text-[var(--accent)]" />
                Source: {parsedDetails?.resolutionSource || "Web"}
              </span>
            </div>
          </div>

          {(isExpired || isProposed || isDisputed || isFinalized) ? (
            <div className="vm-card overflow-hidden bg-[linear-gradient(135deg,rgba(108,142,255,0.14),rgba(0,228,180,0.06))] p-6 md:p-7">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--primary)]">Optimistic Resolver</div>
                  <h2 className="font-display mt-2 text-2xl font-bold text-white">Settlement control plane</h2>
                </div>
                <Gavel className="h-8 w-8 text-white/25" />
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-[1.5rem] border border-white/8 bg-black/20 p-5">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Current phase</div>
                  <div className="mt-3 flex items-center gap-2">
                    <span className={`vm-status-pill ${statusClass(status)}`}>{status}</span>
                  </div>

                  {isExpired ? (
                    <div className="mt-5 space-y-3">
                      <p className="text-sm leading-7 text-white/68">
                        The deadline has passed. Anyone can propose the correct result by staking{" "}
                        {oracleStake ? formatEther(oracleStake) : "0.01"} ETH.
                      </p>
                      <div className="grid gap-2">
                        {labels.map((label, index) => (
                          <button key={`${label}-${index}`} type="button" onClick={() => onPropose(index)} className="vm-secondary-btn justify-center">
                            Propose {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {isProposed ? (
                    <div className="mt-5 space-y-3">
                      <p className="text-sm leading-7 text-white/68">Proposed outcome: {proposedOutcomeLabel}</p>
                      <div className="rounded-[1.2rem] border border-white/8 bg-white/[0.04] p-4">
                        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
                          <History className="h-3.5 w-3.5" />
                          Dispute window
                        </div>
                        <div className="mt-3 text-lg font-bold text-white">
                          {getCountdown(parsedMarket.disputeWindowEnd)}
                        </div>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <button type="button" onClick={onChallenge} className="vm-secondary-btn justify-center">
                          <AlertCircle className="h-4 w-4" />
                          Challenge
                        </button>
                        {isOwner ? (
                          <button
                            type="button"
                            onClick={onFinalize}
                            disabled={Number(parsedMarket.disputeWindowEnd) * 1000 > Date.now()}
                            className="vm-primary-btn justify-center disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Finalize
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {isDisputed ? (
                    <div className="mt-5 space-y-3">
                      <p className="text-sm leading-7 text-white/68">
                        The proposed outcome was challenged. The market is currently in dispute resolution.
                      </p>
                      <div className="rounded-[1.2rem] border border-rose-400/18 bg-rose-400/10 p-4 text-sm font-medium text-rose-300">
                        Escalated for final adjudication.
                      </div>
                      {isOwner ? (
                        <button type="button" onClick={onFinalize} className="vm-primary-btn justify-center">
                          Process dispute result
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  {isFinalized ? (
                    <div className="mt-5 space-y-3">
                      <div className="rounded-[1.25rem] border border-emerald-400/18 bg-emerald-400/10 p-4">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">Official result</div>
                        <div className="font-display mt-2 text-2xl font-bold text-white">{currentOutcomeLabel}</div>
                      </div>
                      {canClaim ? (
                        <button type="button" onClick={onClaim} disabled={isClaiming} className="vm-primary-btn justify-center disabled:cursor-not-allowed disabled:opacity-50">
                          Claim winnings
                        </button>
                      ) : hasClaimed ? (
                        <div className="rounded-[1.2rem] border border-emerald-400/18 bg-emerald-400/10 p-4 text-sm font-medium text-emerald-300">
                          This wallet has already claimed.
                        </div>
                      ) : hasPosition ? (
                        <div className="rounded-[1.2rem] border border-white/8 bg-white/[0.04] p-4 text-sm leading-7 text-white/68">
                          No payout has been assigned to this wallet yet. Open settlement data and assign payouts before claiming.
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="rounded-[1.5rem] border border-white/8 bg-black/20 p-5">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Economic rules</div>
                  <div className="mt-5 space-y-3 text-sm leading-7 text-white/68">
                    <div className="flex items-center justify-between gap-4 rounded-[1rem] border border-white/6 bg-white/[0.03] px-4 py-3">
                      <span>Oracle stake</span>
                      <span className="font-mono font-bold text-white">{oracleStake ? formatEther(oracleStake) : "0.01"} ETH</span>
                    </div>
                    <div className="flex items-center justify-between gap-4 rounded-[1rem] border border-white/6 bg-white/[0.03] px-4 py-3">
                      <span>Success reward</span>
                      <span className="font-semibold text-white">190% of stake</span>
                    </div>
                    <div className="flex items-center justify-between gap-4 rounded-[1rem] border border-white/6 bg-white/[0.03] px-4 py-3">
                      <span>Platform fee</span>
                      <span className="font-semibold text-white">10%</span>
                    </div>
                  </div>
                </div>
              </div>

              {isFinalized ? (
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <div className="rounded-[1.5rem] border border-white/8 bg-black/20 p-5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Settlement opening</div>
                    <p className="mt-3 text-sm leading-7 text-white/68">
                      Open winner flags for the listed bettors so the manual settlement workflow has public settlement data to reference.
                    </p>
                    <textarea
                      value={settlementAddresses}
                      onChange={(event) => setSettlementAddresses(event.target.value)}
                      placeholder="Paste bettor addresses, separated by commas or new lines"
                      className="vm-input mt-4 min-h-[8rem] resize-y py-4"
                    />
                    <button
                      type="button"
                      onClick={onOpenSettlementData}
                      disabled={isOpeningSettlement}
                      className="vm-secondary-btn mt-4 justify-center disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isOpeningSettlement ? "Opening..." : "Open Settlement Data"}
                    </button>
                  </div>

                  {isOwner ? (
                    <div className="rounded-[1.5rem] border border-white/8 bg-black/20 p-5">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Owner payout assignment</div>
                      <p className="mt-3 text-sm leading-7 text-white/68">
                        In this v1, the owner manually assigns payouts after the optimistic oracle has finalized the market.
                      </p>
                      <input
                        value={winnerAddress}
                        onChange={(event) => setWinnerAddress(event.target.value)}
                        placeholder="Winner wallet address"
                        className="vm-input mt-4"
                      />
                      <input
                        value={manualPayoutEth}
                        onChange={(event) => setManualPayoutEth(event.target.value)}
                        placeholder="Payout amount in ETH"
                        className="vm-input mt-3"
                      />
                      <button
                        type="button"
                        onClick={onAssignPayout}
                        disabled={isAssigningPayout}
                        className="vm-primary-btn mt-4 justify-center disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isAssigningPayout ? "Assigning..." : "Assign Manual Payout"}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <EncryptedActivity marketId={marketId} />
        </div>

        <aside className="space-y-6">
          {isActive ? (
            <BetPlacement
              selectedOutcome={selectedOutcome}
              outcomeLabels={labels}
              amount={amount}
              balanceLabel={balance ? `${Number(balance.formatted).toFixed(4)} ${balance.symbol}` : "Not connected"}
              alreadyBet={Boolean(hasPosition)}
              isSubmitting={isBetting}
              submitLabel={isBetting ? "Processing..." : "Confirm Position"}
              statusHint="Your directional side is encrypted before submission. Only the stake value is visible in this honest v1 model."
              onSelectOutcome={setSelectedOutcome}
              onAmountChange={setAmount}
              onMax={() => setAmount(balance ? (Number(balance.formatted) * 0.99).toFixed(5) : "0")}
              onSubmit={onPlaceBet}
            />
          ) : (
            <div className="vm-card p-6">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/6 text-[var(--primary)]">
                <TrendingUp className="h-5 w-5" />
              </div>
              <h3 className="font-display mt-5 text-xl font-bold text-white">Betting Closed</h3>
              <p className="mt-3 text-sm leading-7 text-white/62">
                This market has reached its deadline and is no longer accepting new positions. Follow the settlement panel for resolution progress.
              </p>
            </div>
          )}

          <div className="vm-card p-6">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--primary)]">Your Position</div>
            {address ? (
              hasPosition ? (
                <div className="mt-4 space-y-3">
                  <div className="rounded-[1.35rem] border border-[var(--primary)]/16 bg-[var(--primary)]/8 p-4">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--primary)]">Recovered outcome</div>
                    <div className="font-display mt-2 text-xl font-bold text-white">
                      {isDecrypting ? "Decrypting..." : decryptedPosition !== null ? labels[decryptedPosition] : "Encrypted"}
                    </div>
                  </div>
                  {isFinalized && decryptedPosition !== null ? (
                    <div className="flex items-center justify-between rounded-[1.2rem] border border-white/6 bg-white/[0.03] px-4 py-3">
                      <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/35">Result</span>
                      <span
                        className={`rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] ${decryptedPosition === parsedMarket.outcome
                            ? "border-emerald-400/18 bg-emerald-400/10 text-emerald-300"
                            : "border-rose-400/18 bg-rose-400/10 text-rose-300"
                          }`}
                      >
                        {decryptedPosition === parsedMarket.outcome ? "Won" : "Lost"}
                      </span>
                    </div>
                  ) : null}
                  <div className="rounded-[1.2rem] border border-white/6 bg-white/[0.03] px-4 py-3">
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">Claimable payout</div>
                    <div className="mt-2 text-base font-semibold text-white">
                      {claimablePayoutWei > 0n ? `${Number(formatEther(claimablePayoutWei)).toFixed(4)} ETH` : "Not assigned"}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm leading-7 text-white/62">No position found for this wallet on the selected market.</p>
              )
            ) : (
              <p className="mt-4 text-sm leading-7 text-white/62">Connect your wallet to recover your encrypted position locally.</p>
            )}
          </div>

          <div className="vm-card p-6">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--primary)]">Audit & Links</div>
            <div className="mt-4 space-y-3">
              {metadataCid ? (
                <a
                  href={cidToExplorer(metadataCid as string)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded-[1rem] border border-white/6 bg-white/[0.03] px-4 py-3 text-sm font-medium text-white/72 transition hover:text-[var(--primary)]"
                >
                  <span className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Market Metadata
                  </span>
                  <ExternalLink className="h-4 w-4" />
                </a>
              ) : null}
              <div className="flex items-center justify-between rounded-[1rem] border border-white/6 bg-white/[0.03] px-4 py-3 text-sm font-medium text-white/72">
                <span className="flex items-center gap-2">
                  <Wallet className="h-4 w-4" />
                  Contract Address
                </span>
                <span className="font-mono">{shieldBetConfig.address.slice(0, 6)}...</span>
              </div>
              {statusMessage ? (
                <div className="rounded-[1rem] border border-white/6 bg-white/[0.03] px-4 py-3 text-sm leading-7 text-white/62">
                  {statusMessage}
                </div>
              ) : null}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
