"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Clock3, ExternalLink, FileText, Wallet } from "lucide-react";
import { formatEther, getAddress, parseAbiItem, parseEther } from "viem";
import {
  useAccount,
  useBalance,
  usePublicClient,
  useReadContract,
  useWaitForTransactionReceipt,
  useWalletClient,
  useWriteContract
} from "wagmi";
import { BetPlacement } from "@/components/bet-placement";
import { ClaimConfirmation, ClaimFlow } from "@/components/claim-flow";
import { EncryptedActivity } from "@/components/encrypted-activity";
import { EncryptedBands } from "@/components/encrypted-bands";
import { RuntimeAlerts } from "@/components/runtime-alerts";
import { SettlementPlanPanel, type SettlementPlanView } from "@/components/settlement-plan";
import { BetOutcome, decryptUserHandles, encryptBetInputs } from "@/lib/encryption";
import { cidToExplorer, formatDeadline, getCountdown } from "@/lib/format";
import { shieldBetConfig } from "@/lib/contract";
import { decodeMarketDetails, decodeMarketView } from "@/lib/market-contract";
import { getEncryptedBandCount, inferCategory, getMarketStatus } from "@/lib/market-ui";
import { getLocalBet, saveLocalBet } from "@/lib/local-bets";
import { getRuntimeDiagnostics } from "@/lib/runtime-config";
import { logError, logInfo, logWarn } from "@/lib/telemetry";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const betPlacedEvent = parseAbiItem(
  "event BetPlaced(uint256 indexed marketId, address indexed bettor, bytes32 encOutcomeHandle, uint256 stakeAmountWei)"
);

type BetFlowStage = "idle" | "preparing" | "encrypting" | "wallet" | "confirming";
type SettlementLoadingState = "idle" | "opening" | "loading-plan" | "assigning" | "cancelling";

type PositionLabel = "YES" | "NO" | "Encrypted";

function formatEthLabel(value: bigint) {
  return `${Number(formatEther(value)).toFixed(4)} ETH`;
}

function getOutcomeLabel(outcome: number) {
  if (outcome === 1) return "YES";
  if (outcome === 2) return "NO";
  if (outcome === 3) return "Cancelled";
  return "Unresolved";
}

export default function MarketBetPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const marketParam = params?.id;
  const marketId = useMemo(() => BigInt(marketParam || "0"), [marketParam]);

  const initialSide = searchParams?.get("side")?.toLowerCase();

  const [selectedOutcome, setSelectedOutcome] = useState<BetOutcome>(initialSide === "no" ? 2 : 1);
  const [amount, setAmount] = useState("0.0001");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [claimOpen, setClaimOpen] = useState(false);
  const [adminResolveOutcome, setAdminResolveOutcome] = useState<BetOutcome>(1);
  const [adminMessage, setAdminMessage] = useState<string | null>(null);
  const [betFlowStage, setBetFlowStage] = useState<BetFlowStage>("idle");
  const [positionDecrypting, setPositionDecrypting] = useState(false);
  const [settlementPlan, setSettlementPlan] = useState<SettlementPlanView | null>(null);
  const [settlementLoading, setSettlementLoading] = useState<SettlementLoadingState>("idle");
  const [localPosition, setLocalPosition] = useState<PositionLabel>("Encrypted");

  const { address, chainId } = useAccount();
  const normalizedAddress = address ? getAddress(address) : null;
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { data: balance } = useBalance({ address });
  const litActionCid = process.env.NEXT_PUBLIC_LIT_ACTION_CID;
  const expectedChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 11155111);

  const { writeContractAsync, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash });

  const { data: marketData } = useReadContract({
    ...shieldBetConfig,
    functionName: "markets",
    args: [marketId]
  });

  const { data: ownerAddress } = useReadContract({
    ...shieldBetConfig,
    functionName: "owner"
  });

  const { data: metadataCid } = useReadContract({
    ...shieldBetConfig,
    functionName: "marketMetadataCID",
    args: [marketId]
  });

  const { data: marketDetailsData } = useReadContract({
    ...shieldBetConfig,
    functionName: "getMarketDetails",
    args: [marketId]
  });

  const { data: resolutionCid } = useReadContract({
    ...shieldBetConfig,
    functionName: "marketResolutionCID",
    args: [marketId]
  });

  const { data: marketPoolBalance } = useReadContract({
    ...shieldBetConfig,
    functionName: "marketPoolBalance",
    args: [marketId]
  });

  const { data: totalPool } = useReadContract({
    ...shieldBetConfig,
    functionName: "totalPool",
    args: [marketId]
  });

  const { data: reservedPayoutBalance } = useReadContract({
    ...shieldBetConfig,
    functionName: "reservedPayoutBalance",
    args: [marketId]
  });

  const { data: feeBasisPoints } = useReadContract({
    ...shieldBetConfig,
    functionName: "feeBasisPoints",
    args: [marketId]
  });

  const { data: resolutionGracePeriod } = useReadContract({
    ...shieldBetConfig,
    functionName: "RESOLUTION_GRACE_PERIOD"
  });

  const { data: hasPosition } = useReadContract({
    ...shieldBetConfig,
    functionName: "hasPosition",
    args: [marketId, address || ZERO_ADDRESS],
    query: {
      enabled: Boolean(address)
    }
  });

  const { data: stakeAmountWei } = useReadContract({
    ...shieldBetConfig,
    functionName: "stakeAmounts",
    args: [marketId, address || ZERO_ADDRESS],
    query: {
      enabled: Boolean(address)
    }
  });

  const { data: claimQuote } = useReadContract({
    ...shieldBetConfig,
    functionName: "getClaimQuote",
    args: [marketId, address || ZERO_ADDRESS],
    query: {
      enabled: Boolean(address && decodeMarketView(marketData)?.resolved)
    }
  });

  const { data: encryptedOutcomeHandle } = useReadContract({
    ...shieldBetConfig,
    functionName: "getMyOutcome",
    args: [marketId],
    query: {
      enabled: Boolean(address && hasPosition && walletClient)
    }
  });

  useEffect(() => {
    logInfo("market-detail", "read market core", {
      marketId: marketId.toString(),
      contract: shieldBetConfig.address,
      marketData: marketData || null
    });
  }, [marketData, marketId]);

  useEffect(() => {
    logInfo("market-detail", "read market cids", {
      marketId: marketId.toString(),
      metadataCid: metadataCid || "",
      resolutionCid: resolutionCid || "",
      totalPoolWei: typeof totalPool === "bigint" ? totalPool.toString() : "0",
      marketPoolBalanceWei: typeof marketPoolBalance === "bigint" ? marketPoolBalance.toString() : "0",
      reservedPayoutBalanceWei: typeof reservedPayoutBalance === "bigint" ? reservedPayoutBalance.toString() : "0",
      feeBasisPoints: typeof feeBasisPoints === "bigint" ? feeBasisPoints.toString() : "0"
    });
  }, [marketId, metadataCid, resolutionCid, totalPool, marketPoolBalance, reservedPayoutBalance, feeBasisPoints]);

  useEffect(() => {
    logInfo("market-detail", "read position and claim quote", {
      marketId: marketId.toString(),
      account: address || "",
      hasPosition: Boolean(hasPosition),
      stakeAmountWei: typeof stakeAmountWei === "bigint" ? stakeAmountWei.toString() : "0",
      claimQuote: claimQuote
        ? {
            payout: claimQuote[0].toString(),
            eligible: claimQuote[1]
          }
        : null
    });
  }, [marketId, address, hasPosition, stakeAmountWei, claimQuote]);

  useEffect(() => {
    const bet = getLocalBet(marketId, address);
    if (!bet) {
      setLocalPosition("Encrypted");
      return;
    }

    setLocalPosition(bet.position);
  }, [marketId, address, hash]);

  useEffect(() => {
    if (!normalizedAddress || !walletClient || !hasPosition || !encryptedOutcomeHandle) {
      return;
    }

    const userAddress = normalizedAddress;
    const signer = walletClient;
    const outcomeHandle = encryptedOutcomeHandle as `0x${string}`;

    let cancelled = false;

    async function loadPosition() {
      try {
        setPositionDecrypting(true);
        const decrypted = await decryptUserHandles({
          contractAddress: shieldBetConfig.address,
          userAddress,
          walletClient: signer,
          handles: [outcomeHandle]
        });

        if (cancelled) return;

        const outcomeValue = Number(decrypted[outcomeHandle]);
        if (outcomeValue === 1) {
          setLocalPosition("YES");
        } else if (outcomeValue === 2) {
          setLocalPosition("NO");
        }
      } catch (error) {
        if (!cancelled) {
          logWarn("market-detail", "failed to decrypt user position", {
            marketId: marketId.toString(),
            account: normalizedAddress,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      } finally {
        if (!cancelled) {
          setPositionDecrypting(false);
        }
      }
    }

    void loadPosition();

    return () => {
      cancelled = true;
    };
  }, [encryptedOutcomeHandle, hasPosition, marketId, normalizedAddress, walletClient]);

  if (!marketParam || !marketData) {
    return <p className="subtle">Loading market...</p>;
  }

  const parsedMarket = decodeMarketView(marketData);
  if (!parsedMarket) {
    return <p className="text-sm text-rose-500">Unable to decode market payload. Check contract ABI/config.</p>;
  }

  const parsedDetails = decodeMarketDetails(marketDetailsData);
  const question = parsedMarket.question;
  const deadline = parsedMarket.deadline;
  const outcome = parsedMarket.outcome;
  const resolved = parsedMarket.resolved;
  const creator = parsedMarket.creator;

  const diagnostics = getRuntimeDiagnostics();
  const hasBlockingDiagnostics = diagnostics.some((diagnostic) => diagnostic.severity === "error");
  const isOwner = Boolean(address && ownerAddress && address.toLowerCase() === ownerAddress.toLowerCase());
  const marketStatus = getMarketStatus(deadline, resolved);
  const category = parsedDetails?.category.trim() || inferCategory(question);

  const marketClosed = Date.now() >= Number(deadline) * 1000;
  const marketResolvedYesNo = resolved && (outcome === 1 || outcome === 2);
  const marketCancelled = resolved && outcome === 3;
  const alreadyBet = Boolean(hasPosition);
  const claimPayout = claimQuote?.[0] || 0n;
  const eligibleToClaim = claimQuote?.[1] || false;

  const encryptedVolumeBands = getEncryptedBandCount(marketId, 6, 10);
  const participantBands = getEncryptedBandCount(marketId + 11n, 3, 8);
  const poolBalanceWei = typeof marketPoolBalance === "bigint" ? marketPoolBalance : 0n;
  const totalPoolWei = typeof totalPool === "bigint" ? totalPool : poolBalanceWei;
  const reservedPayoutWei = typeof reservedPayoutBalance === "bigint" ? reservedPayoutBalance : 0n;
  const feeBps = typeof feeBasisPoints === "bigint" ? feeBasisPoints : 0n;
  const stakeWei = typeof stakeAmountWei === "bigint" ? stakeAmountWei : 0n;
  const gracePeriod = typeof resolutionGracePeriod === "bigint" ? resolutionGracePeriod : 0n;
  const cancellationUnlockTimestamp = gracePeriod > 0n ? deadline + gracePeriod : null;
  const canCancelUnresolved =
    !resolved && marketClosed && cancellationUnlockTimestamp !== null && Date.now() >= Number(cancellationUnlockTimestamp) * 1000;

  const canPlaceBet = !resolved && !marketClosed;
  const poolBalanceLabel = formatEthLabel(poolBalanceWei);
  const totalPoolLabel = formatEthLabel(totalPoolWei);
  const reservedPayoutLabel = formatEthLabel(reservedPayoutWei);
  const stakeLabel = stakeWei > 0n ? formatEthLabel(stakeWei) : null;
  const knownPosition = localPosition === "YES" || localPosition === "NO";
  const userOutcomeMatches =
    knownPosition && marketResolvedYesNo
      ? (localPosition === "YES" && outcome === 1) || (localPosition === "NO" && outcome === 2)
      : null;
  const marketStatusClass =
    marketStatus === "Resolved"
      ? "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300"
      : marketStatus === "Closed"
        ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
        : marketStatus === "Closing Soon"
          ? "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300"
          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300";

  function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      const maybe = error as Error & {
        shortMessage?: string;
        details?: string;
        cause?: unknown;
      };
      if (maybe.shortMessage) return maybe.shortMessage;
      if (maybe.details) return maybe.details;
      if (maybe.cause instanceof Error) return maybe.cause.message;
      return maybe.message;
    }

    return String(error);
  }

  async function flushUi() {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }

  async function getGasOverrides(
    functionName:
      | "placeBet"
      | "resolveMarket"
      | "computeAndAssignPayouts"
      | "openSettlementData"
      | "claimWinnings"
      | "cancelUnresolvedMarket",
    args: readonly unknown[],
    value?: bigint
  ) {
    if (!publicClient || chainId !== expectedChainId || shieldBetConfig.address === ZERO_ADDRESS) {
      return {};
    }

    try {
      const [estimatedGas, latestBlock] = await Promise.all([
        publicClient.estimateContractGas({
          address: shieldBetConfig.address,
          abi: shieldBetConfig.abi,
          functionName: functionName as never,
          args: args as never,
          account: normalizedAddress || undefined,
          value
        }),
        publicClient.getBlock({ blockTag: "latest" })
      ]);

      const networkCap = (latestBlock.gasLimit * 90n) / 100n;
      const paddedEstimate = (estimatedGas * 12n) / 10n;
      const gas = paddedEstimate > networkCap ? networkCap : paddedEstimate;
      return gas > 0n ? { gas } : {};
    } catch (error) {
      logWarn("market-detail", "gas estimation failed, proceeding without manual cap", {
        functionName,
        marketId: marketId.toString(),
        error: error instanceof Error ? error.message : String(error)
      });
      return {};
    }
  }

  async function placeBet() {
    if (!address) {
      setStatusMessage("Connect your wallet first.");
      return;
    }
    if (!normalizedAddress) {
      setStatusMessage("Wallet address is not ready yet. Try again.");
      return;
    }
    if (hasBlockingDiagnostics) {
      setStatusMessage("Resolve the configuration errors shown above before placing a bet.");
      return;
    }
    if (chainId !== expectedChainId) {
      setStatusMessage(`Wrong network. Switch wallet to chain ID ${expectedChainId}.`);
      return;
    }

    try {
      setStatusMessage(null);
      setBetFlowStage("preparing");
      setStatusMessage("Validating your stake amount and building the request...");
      await flushUi();

      const amountWei = parseEther(amount);
      logInfo("market-detail", "placeBet encrypt request", {
        marketId: marketId.toString(),
        account: address,
        selectedOutcome,
        amountWei: amountWei.toString()
      });

      setBetFlowStage("encrypting");
      setStatusMessage("Encrypting your market side with Zama fhEVM...");
      await flushUi();
      const encrypted = await encryptBetInputs(selectedOutcome, amountWei, {
        contractAddress: shieldBetConfig.address,
        userAddress: normalizedAddress
      });
      logInfo("market-detail", "placeBet encrypted payload", {
        marketId: marketId.toString(),
        encOutcome: encrypted.encOutcome,
        inputProof: encrypted.inputProof
      });

      setBetFlowStage("wallet");
      setStatusMessage("Encrypted side is ready. Confirm the ETH stake transaction in your wallet.");
      await flushUi();
      const gasOverrides = await getGasOverrides("placeBet", [marketId, encrypted.encOutcome, encrypted.inputProof] as const, amountWei);
      const txHash = await writeContractAsync({
        ...shieldBetConfig,
        functionName: "placeBet",
        args: [marketId, encrypted.encOutcome, encrypted.inputProof],
        value: amountWei,
        ...gasOverrides
      });

      setBetFlowStage("confirming");
      setStatusMessage("Transaction submitted. Waiting for on-chain confirmation...");
      logInfo("market-detail", "placeBet tx submitted", {
        marketId: marketId.toString(),
        account: address,
        txHash
      });
      const receipt = await publicClient?.waitForTransactionReceipt({ hash: txHash });
      if (!receipt || receipt.status !== "success") {
        throw new Error("Bet transaction failed or was not confirmed");
      }

      saveLocalBet({
        marketId: marketId.toString(),
        wallet: normalizedAddress,
        position: selectedOutcome === 1 ? "YES" : "NO",
        amountWei: amountWei.toString(),
        createdAt: Date.now()
      });

      setLocalPosition(selectedOutcome === 1 ? "YES" : "NO");
      setStatusMessage("Bet placed. Your side is encrypted on-chain, while your ETH stake is public in v1.");
    } catch (error) {
      logError("market-detail", "placeBet failed", error);
      const message = getErrorMessage(error) || "Bet transaction failed";
      setStatusMessage(message);
    } finally {
      setBetFlowStage("idle");
    }
  }

  async function executeClaim(): Promise<ClaimConfirmation> {
    if (!address) throw new Error("Connect wallet first");
    if (chainId !== expectedChainId) throw new Error(`Wrong network. Switch wallet to chain ID ${expectedChainId}.`);
    const normalizedAccount = normalizedAddress || getAddress(address);

    let litExecution:
      | {
          actionCid: string;
          response: unknown;
          logs: string;
          attestation: {
            eligible: boolean;
            account: string;
            marketId: string;
            resolvedOutcome: string;
            expectedPayoutWei: string;
            txHash?: string;
          };
        }
      | null = null;

    if (litActionCid && marketResolvedYesNo) {
      if (!walletClient) {
        throw new Error("Wallet signer not ready for Lit action execution");
      }

      setStatusMessage("Running Lit eligibility check...");
      const { LitHandshakeTimeoutError, runLitClaimAction } = await import("@/lib/lit");
      logInfo("market-detail", "claim lit action start", {
        marketId: marketId.toString(),
        account: normalizedAccount,
        actionCid: litActionCid,
        resolvedOutcome: outcome.toString(),
        expectedPayoutWei: claimPayout.toString()
      });
      try {
        litExecution = await runLitClaimAction({
          actionCid: litActionCid,
          marketId: marketId.toString(),
          account: normalizedAccount,
          resolvedOutcome: outcome.toString(),
          expectedPayoutWei: claimPayout.toString(),
          walletClient
        });
        logInfo("market-detail", "claim lit action complete", {
          marketId: marketId.toString(),
          actionCid: litExecution.actionCid,
          litAttestation: litExecution.attestation,
          litLogs: litExecution.logs
        });
      } catch (error) {
        if (error instanceof LitHandshakeTimeoutError) {
          logWarn("market-detail", "claim lit action timed out, falling back to on-chain verification", {
            marketId: marketId.toString(),
            account: normalizedAccount,
            actionCid: litActionCid,
            message: error.message
          });
          setStatusMessage("Lit verification is temporarily unavailable. Continuing with on-chain claim verification only.");
        } else {
          throw error;
        }
      }
    }

    logInfo("market-detail", "claim submit tx", {
      marketId: marketId.toString(),
      account: normalizedAccount
    });
    const claimGasOverrides = await getGasOverrides("claimWinnings", [marketId] as const);
    const txHash = await writeContractAsync({
      ...shieldBetConfig,
      functionName: "claimWinnings",
      args: [marketId],
      ...claimGasOverrides
    });
    logInfo("market-detail", "claim tx submitted", { txHash });

    const receipt = await publicClient?.waitForTransactionReceipt({ hash: txHash });
    if (!receipt || receipt.status !== "success") {
      throw new Error("Claim transaction failed or was not confirmed");
    }

    const verifyResponse = await fetch("/api/lit/claim", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        marketId: marketId.toString(),
        account: normalizedAccount,
        txHash,
        expectedPayoutWei: claimPayout.toString(),
        litActionCid: litExecution?.actionCid || "",
        resolvedOutcome: outcome.toString(),
        litResponse: litExecution?.response ?? null,
        litLogs: litExecution?.logs || ""
      })
    });

    const verifyBody = (await verifyResponse.json()) as
      | ({ error?: string } & ClaimConfirmation)
      | { error?: string };

    if (!verifyResponse.ok) {
      throw new Error(verifyBody.error || "Claim verification failed");
    }
    if (!("txHash" in verifyBody) || !("plaintextPayoutWei" in verifyBody) || !("mode" in verifyBody)) {
      throw new Error("Claim verification response was incomplete");
    }

    setStatusMessage(
      marketCancelled
        ? "Refund verified and submitted."
        : verifyBody.mode === "lit"
          ? "Claim verified with Lit and submitted."
          : "Claim verified on-chain and submitted."
    );
    return verifyBody;
  }

  async function resolveMarket() {
    try {
      if (chainId !== expectedChainId) {
        throw new Error(`Wrong network. Switch wallet to chain ID ${expectedChainId}.`);
      }
      if (!marketClosed) {
        throw new Error(`Market is still open. Resolution unlocks after ${formatDeadline(deadline)}.`);
      }
      setAdminMessage("Submitting market resolution...");
      const gasOverrides = await getGasOverrides("resolveMarket", [marketId, adminResolveOutcome] as const);
      const resolveHash = await writeContractAsync({
        ...shieldBetConfig,
        functionName: "resolveMarket",
        args: [marketId, adminResolveOutcome],
        ...gasOverrides
      });

      const resolveReceipt = await publicClient?.waitForTransactionReceipt({ hash: resolveHash });
      if (!resolveReceipt || resolveReceipt.status !== "success") {
        throw new Error("Resolution transaction failed");
      }

      setAdminMessage("Market resolved on-chain.");
    } catch (error) {
      logError("market-detail", "resolve flow failed", error);
      setAdminMessage(error instanceof Error ? error.message : "Failed to resolve market");
    }
  }

  async function cancelMarket() {
    try {
      if (chainId !== expectedChainId) {
        throw new Error(`Wrong network. Switch wallet to chain ID ${expectedChainId}.`);
      }
      setSettlementLoading("cancelling");
      setAdminMessage("Submitting market cancellation...");
      const gasOverrides = await getGasOverrides("cancelUnresolvedMarket", [marketId] as const);
      const cancelHash = await writeContractAsync({
        ...shieldBetConfig,
        functionName: "cancelUnresolvedMarket",
        args: [marketId],
        ...gasOverrides
      });

      const cancelReceipt = await publicClient?.waitForTransactionReceipt({ hash: cancelHash });
      if (!cancelReceipt || cancelReceipt.status !== "success") {
        throw new Error("Cancellation transaction failed");
      }

      setAdminMessage("Market cancelled. Bettors can now claim refunds.");
    } catch (error) {
      logError("market-detail", "cancel market failed", error);
      setAdminMessage(error instanceof Error ? error.message : "Failed to cancel market");
    } finally {
      setSettlementLoading("idle");
    }
  }

  async function openSettlementData() {
    try {
      if (chainId !== expectedChainId) {
        throw new Error(`Wrong network. Switch wallet to chain ID ${expectedChainId}.`);
      }
      setSettlementLoading("opening");
      setAdminMessage(null);
      const logs = await publicClient?.getLogs({
        address: shieldBetConfig.address,
        event: betPlacedEvent,
        args: { marketId },
        fromBlock: 0n,
        toBlock: "latest"
      });
      const bettors = Array.from(new Set((logs || []).map((log) => getAddress(String(log.args.bettor)))));
      if (!bettors.length) {
        throw new Error("No placed bets were found for this market.");
      }

      const gasOverrides = await getGasOverrides("openSettlementData", [marketId, bettors] as const);
      const openHash = await writeContractAsync({
        ...shieldBetConfig,
        functionName: "openSettlementData",
        args: [marketId, bettors],
        ...gasOverrides
      });
      await publicClient?.waitForTransactionReceipt({ hash: openHash });
      setAdminMessage("Settlement data opened for post-resolution decryption.");
    } catch (error) {
      logError("market-detail", "open settlement data failed", error);
      setAdminMessage(error instanceof Error ? error.message : "Failed to open settlement data");
    } finally {
      setSettlementLoading("idle");
    }
  }

  async function loadSettlementPlan() {
    try {
      setSettlementLoading("loading-plan");
      setAdminMessage(null);
      const response = await fetch(`/api/markets/${marketId.toString()}/settlement`, { cache: "no-store" });
      const body = (await response.json()) as SettlementPlanView & { error?: string };
      if (!response.ok) {
        throw new Error(body.error || "Unable to generate settlement plan");
      }
      setSettlementPlan(body);
      setAdminMessage("Settlement plan generated from decrypted resolved bets.");
    } catch (error) {
      logError("market-detail", "load settlement plan failed", error);
      setSettlementPlan(null);
      setAdminMessage(error instanceof Error ? error.message : "Failed to load settlement plan");
    } finally {
      setSettlementLoading("idle");
    }
  }

  async function assignPayoutsFromPlan() {
    if (!settlementPlan) {
      setAdminMessage("Generate a settlement plan first.");
      return;
    }

    try {
      if (chainId !== expectedChainId) {
        throw new Error(`Wrong network. Switch wallet to chain ID ${expectedChainId}.`);
      }
      setSettlementLoading("assigning");
      setAdminMessage(null);
      const winners = settlementPlan.participants.filter((participant) => participant.isWinner && !participant.hasClaimed);
      if (!winners.length) {
        throw new Error("No unclaimed winners are available in the current settlement plan.");
      }

      const winnerAddresses = winners.map((participant) => getAddress(participant.bettor));
      const winnerAmounts = winners.map((participant) => BigInt(participant.amountWei));
      const totalWinningSideWei = BigInt(settlementPlan.totalWinningSideWei);
      const gasOverrides = await getGasOverrides(
        "computeAndAssignPayouts",
        [marketId, winnerAddresses, winnerAmounts, totalWinningSideWei] as const
      );

      const payoutHash = await writeContractAsync({
        ...shieldBetConfig,
        functionName: "computeAndAssignPayouts",
        args: [marketId, winnerAddresses, winnerAmounts, totalWinningSideWei],
        ...gasOverrides
      });
      await publicClient?.waitForTransactionReceipt({ hash: payoutHash });
      setAdminMessage("Winner payouts assigned from the settlement plan.");
      await loadSettlementPlan();
    } catch (error) {
      logError("market-detail", "assign payout batch failed", error);
      setAdminMessage(error instanceof Error ? error.message : "Failed to assign payouts");
    } finally {
      setSettlementLoading("idle");
    }
  }

  const claimActionLabel = marketCancelled ? "Claim refund" : "Claim winnings";
  const claimDialogLabel = marketCancelled ? "refund" : "winnings";

  return (
    <section className="space-y-5">
      <RuntimeAlerts diagnostics={diagnostics} />

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <Link href="/markets" className="underline underline-offset-2">
          Markets
        </Link>
        <span>&gt;</span>
        <span>{category}</span>
        <span>&gt;</span>
        <span className="line-clamp-1 max-w-md">{question}</span>
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-3">
          <div className="surface p-5 md:p-6">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 md:text-3xl">{question}</h1>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
              <span className={`rounded-full px-2.5 py-1 font-semibold ${marketStatusClass}`}>{marketStatus}</span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700 dark:bg-slate-900 dark:text-slate-300">
                <Clock3 className="mr-1 inline h-3 w-3" /> {formatDeadline(deadline)}
              </span>
            </div>

            <div className="mt-4 grid gap-2 text-sm text-slate-600 dark:text-slate-300">
              {marketResolvedYesNo ? (
                <>
                  <p>
                    <span className="font-medium">Market closed:</span> {formatDeadline(deadline)}
                  </p>
                  <p>
                    <span className="font-medium">Resolved outcome:</span> {getOutcomeLabel(outcome)}
                  </p>
                </>
              ) : marketCancelled ? (
                <>
                  <p>
                    <span className="font-medium">Market closed:</span> {formatDeadline(deadline)}
                  </p>
                  <p>
                    <span className="font-medium">Final state:</span> Cancelled, refunds enabled
                  </p>
                </>
              ) : marketClosed ? (
                <p>
                  <span className="font-medium">Market closed:</span> {formatDeadline(deadline)}
                </p>
              ) : (
                <p>
                  <span className="font-medium">Closes:</span> {formatDeadline(deadline)} ({getCountdown(deadline)})
                </p>
              )}
              <p>
                <span className="font-medium">Pool balance:</span> {poolBalanceLabel}
              </p>
              <p>
                <span className="font-medium">Created by:</span> <span className="font-mono-ui">{creator}</span>
              </p>
              <details className="surface-muted mt-2 p-3">
                <summary className="cursor-pointer text-sm font-semibold text-slate-900 dark:text-slate-100">Resolution criteria</summary>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  {parsedDetails?.resolutionCriteria.trim() || "No explicit resolution criteria has been stored for this market yet."}
                </p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  Resolution source: {parsedDetails?.resolutionSource.trim() || "contract owner transaction"}
                </p>
              </details>
            </div>
          </div>

          {canPlaceBet ? (
            <BetPlacement
              selectedOutcome={selectedOutcome}
              amount={amount}
              balanceLabel={balance ? `${Number(balance.formatted).toFixed(4)} ${balance.symbol}` : "Wallet not connected"}
              alreadyBet={alreadyBet}
              isSubmitting={betFlowStage !== "idle"}
              submitLabel={
                alreadyBet
                  ? "BET ALREADY PLACED"
                  : betFlowStage === "preparing"
                    ? "PREPARING BET..."
                    : betFlowStage === "encrypting"
                      ? "ENCRYPTING SIDE..."
                      : betFlowStage === "wallet"
                        ? "CHECK WALLET TO SIGN"
                        : betFlowStage === "confirming"
                          ? "CONFIRMING ON-CHAIN..."
                          : "CONFIRM BET"
              }
              statusHint={
                alreadyBet
                  ? "This wallet already has a position in this market."
                  : betFlowStage === "preparing"
                    ? "Validating your ETH stake and building the encrypted request."
                    : betFlowStage === "encrypting"
                      ? "ShieldBet v1 encrypts your side with Zama fhEVM before the wallet prompt appears."
                      : betFlowStage === "wallet"
                        ? "Your side is encrypted. Approve the ETH stake transaction in your wallet."
                        : betFlowStage === "confirming"
                          ? "Your bet is submitted. Waiting for the chain to confirm it."
                          : "ShieldBet v1 keeps your side encrypted on-chain. Your ETH stake remains public."
              }
              onSelectOutcome={setSelectedOutcome}
              onAmountChange={setAmount}
              onMax={() => {
                if (!balance) return;
                setAmount((Number(balance.formatted) * 0.98).toFixed(4));
              }}
              onSubmit={placeBet}
            />
          ) : !resolved ? (
            <div className="surface p-5">
              <h2 className="section-title">Market closed</h2>
              <p className="subtle mt-2">
                Betting ended at {formatDeadline(deadline)}. This market is now waiting for a final outcome or cancellation.
              </p>
              {cancellationUnlockTimestamp ? (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  If the owner never resolves it, anyone can cancel the market after {formatDeadline(cancellationUnlockTimestamp)} to unlock refunds.
                </p>
              ) : null}
              {canCancelUnresolved ? (
                <button
                  type="button"
                  onClick={cancelMarket}
                  disabled={settlementLoading !== "idle"}
                  className="mt-4 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {settlementLoading === "cancelling" ? "Cancelling market..." : "Cancel market and unlock refunds"}
                </button>
              ) : null}
            </div>
          ) : (
            <div className="surface p-5">
              <h2 className="section-title">
                {marketCancelled ? "Market cancelled" : `Market resolved: ${getOutcomeLabel(outcome)}`}
              </h2>
              <p className="subtle mt-2">
                {marketCancelled
                  ? eligibleToClaim
                    ? "This market was cancelled after the resolution grace period. You can now claim your ETH refund."
                    : alreadyBet
                      ? "This market was cancelled. Refunds are available to bettors who have not already claimed."
                      : "This market was cancelled. Only wallets with a stake in the market can claim a refund."
                  : eligibleToClaim
                    ? "You have a claim quote available. Open the claim flow to verify and withdraw your payout."
                    : userOutcomeMatches === false
                      ? "Your recorded side did not match the resolved outcome for this market."
                      : userOutcomeMatches === true
                        ? "Your recorded side matched the resolved outcome. Claim becomes available once the payout is assigned."
                        : alreadyBet
                          ? "Your wallet has a position here. Claim becomes available after settlement data is opened and payouts are assigned."
                          : "This market has been resolved. Claims are only available to wallets with assigned winnings."}
              </p>
              <button
                type="button"
                disabled={!eligibleToClaim || isPending || isConfirming}
                onClick={() => setClaimOpen(true)}
                className="mt-4 rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:scale-[1.02] hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {eligibleToClaim ? claimActionLabel : marketCancelled ? "Refund unavailable" : "Claim unavailable"}
              </button>
            </div>
          )}

          {statusMessage && <p className="text-sm text-slate-600 dark:text-slate-300">{statusMessage}</p>}

          {(isOwner || marketResolvedYesNo) && (
            <div className="surface space-y-3 p-5">
              <h2 className="section-title">Settlement Controls</h2>
              {!resolved ? (
                isOwner ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setAdminResolveOutcome(1)}
                        className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                          adminResolveOutcome === 1 ? "bg-emerald-500 text-white" : "bg-slate-100 dark:bg-slate-900"
                        }`}
                      >
                        Resolve YES
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdminResolveOutcome(2)}
                        className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                          adminResolveOutcome === 2 ? "bg-rose-500 text-white" : "bg-slate-100 dark:bg-slate-900"
                        }`}
                      >
                        Resolve NO
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={resolveMarket}
                      disabled={!marketClosed}
                      className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Resolve market
                    </button>
                  </>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Resolution is owner-controlled in v1. If the owner does not resolve after the grace period, anyone can cancel the market to unlock refunds.
                  </p>
                )
              ) : marketResolvedYesNo ? (
                <>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Settlement is a two-step flow in v1: anyone can open resolved-side data, then the owner assigns deterministic payouts from the generated plan.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={openSettlementData}
                      disabled={settlementLoading !== "idle"}
                      className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {settlementLoading === "opening" ? "Opening settlement data..." : "Open settlement data"}
                    </button>
                    <button
                      type="button"
                      onClick={loadSettlementPlan}
                      disabled={settlementLoading !== "idle"}
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200"
                    >
                      {settlementLoading === "loading-plan" ? "Generating plan..." : "Generate payout plan"}
                    </button>
                    {isOwner ? (
                      <button
                        type="button"
                        onClick={assignPayoutsFromPlan}
                        disabled={!settlementPlan || settlementLoading !== "idle"}
                        className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {settlementLoading === "assigning" ? "Assigning payouts..." : "Assign winners in batch"}
                      </button>
                    ) : null}
                  </div>
                  {settlementPlan ? <SettlementPlanPanel plan={settlementPlan} /> : null}
                </>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  This market finished in a cancelled state. Settlement data is not needed; bettors claim refunds directly.
                </p>
              )}
              {adminMessage && <p className="text-sm text-slate-600 dark:text-slate-300">{adminMessage}</p>}
            </div>
          )}
        </div>

        <aside className="space-y-5 lg:col-span-2">
          <div className="surface p-4">
            <h3 className="section-title text-base">Market Stats (v1)</h3>
            <div className="mt-3 space-y-3 text-sm">
              <div className="surface-muted flex items-center justify-between px-3 py-2">
                <span>Total deposited</span>
                <span className="font-mono-ui">{totalPoolLabel}</span>
              </div>
              <div className="surface-muted flex items-center justify-between px-3 py-2">
                <span>Pool balance</span>
                <span className="font-mono-ui">{poolBalanceLabel}</span>
              </div>
              <div className="surface-muted flex items-center justify-between px-3 py-2">
                <span>Reserved payouts</span>
                <span className="font-mono-ui">{reservedPayoutLabel}</span>
              </div>
              <div className="surface-muted flex items-center justify-between px-3 py-2">
                <span>Fee rate</span>
                <span className="font-mono-ui">{Number(feeBps) / 100}%</span>
              </div>
              <div className="surface-muted flex items-center justify-between px-3 py-2">
                <span>Outcome privacy band</span>
                <span className="flex items-center gap-2 font-mono-ui">
                  <EncryptedBands count={encryptedVolumeBands} />
                </span>
              </div>
              <div className="surface-muted flex items-center justify-between px-3 py-2">
                <span>Participation visibility</span>
                <span className="flex items-center gap-2 font-mono-ui">
                  <EncryptedBands count={participantBands} />
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                ShieldBet v1 keeps each wallet&apos;s side encrypted. ETH stakes and total pool size are public on-chain.
              </p>
            </div>
          </div>

          <div className="surface p-4">
            <h3 className="section-title text-base">
              {address && alreadyBet && knownPosition ? `Your ${localPosition} Position` : "Your Position"}
            </h3>
            {address && alreadyBet ? (
              <div className="mt-3 space-y-2 text-sm">
                <p className="text-slate-700 dark:text-slate-300">
                  {knownPosition
                    ? `This wallet is locked into ${localPosition}.`
                    : "This wallet has an encrypted side on-chain. The side is not available in this browser session yet."}
                </p>
                {positionDecrypting ? <p className="text-xs text-slate-500 dark:text-slate-400">Decrypting your side from Zama fhEVM...</p> : null}
                {knownPosition ? (
                  <p>
                    Outcome: <span className="font-semibold">{localPosition}</span>
                  </p>
                ) : null}
                {stakeLabel ? (
                  <p>
                    Stake: <span className="font-semibold">{stakeLabel}</span>
                  </p>
                ) : null}
                {marketResolvedYesNo && userOutcomeMatches !== null ? (
                  <p>
                    Result:{" "}
                    <span className={`font-semibold ${userOutcomeMatches ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                      {userOutcomeMatches ? "Won" : "Lost"}
                    </span>
                  </p>
                ) : null}
                {marketCancelled ? (
                  <p>
                    Result: <span className="font-semibold text-amber-600 dark:text-amber-400">Refund eligible</span>
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled={!resolved || !eligibleToClaim}
                  onClick={() => setClaimOpen(true)}
                  className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {resolved
                    ? eligibleToClaim
                      ? claimActionLabel
                      : marketCancelled
                        ? "Refund unavailable"
                        : userOutcomeMatches === false
                          ? "Position lost"
                          : "Awaiting payout assignment"
                    : "Claim available after resolution"}
                </button>
              </div>
            ) : address ? (
              <p className="subtle mt-3">You have not placed a bet in this market yet.</p>
            ) : (
              <p className="subtle mt-3">Connect your wallet and place a bet to track your position.</p>
            )}
          </div>

          <EncryptedActivity marketId={marketId} />

          <div className="surface p-4">
            <h3 className="section-title text-base">Audit Trail</h3>
            <div className="mt-3 space-y-2 text-sm">
              {metadataCid ? (
                <a
                  href={cidToExplorer(String(metadataCid))}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-indigo-600 underline underline-offset-2 dark:text-indigo-300"
                >
                  <FileText className="h-4 w-4" /> Market metadata CID <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : (
                <p className="subtle">Market CID pending</p>
              )}
              {resolutionCid ? (
                <a
                  href={cidToExplorer(String(resolutionCid))}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-indigo-600 underline underline-offset-2 dark:text-indigo-300"
                >
                  <Wallet className="h-4 w-4" /> Resolution CID <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : (
                <p className="subtle">Resolution CID pending</p>
              )}
            </div>
          </div>
        </aside>
      </div>

      <ClaimFlow
        open={claimOpen}
        onClose={() => setClaimOpen(false)}
        payoutWei={claimPayout}
        onConfirmClaim={executeClaim}
        claimType={claimDialogLabel}
      />
    </section>
  );
}
