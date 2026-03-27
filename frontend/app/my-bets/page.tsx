"use client";

import { useEffect, useMemo, useState } from "react";
import { getAddress } from "viem";
import { useAccount, useReadContract, useReadContracts, useWalletClient } from "wagmi";
import { MyBetRow, MyBetsTable } from "@/components/my-bets-table";
import { shieldBetConfig } from "@/lib/contract";
import { decryptUserHandles } from "@/lib/encryption";
import { decodeMarketView } from "@/lib/market-contract";
import { getLocalBetsByWallet, LocalBetRecord } from "@/lib/local-bets";
import { logInfo, logWarn } from "@/lib/telemetry";

export default function MyBetsPage() {
  const { address } = useAccount();
  const normalizedAddress = address ? getAddress(address) : null;
  const { data: walletClient } = useWalletClient();
  const [localBets, setLocalBets] = useState<LocalBetRecord[]>([]);
  const [decryptedPositions, setDecryptedPositions] = useState<Record<string, "YES" | "NO">>({});

  useEffect(() => {
    setLocalBets(getLocalBetsByWallet(address));
  }, [address]);

  const { data: marketCount } = useReadContract({
    ...shieldBetConfig,
    functionName: "marketCount"
  });

  useEffect(() => {
    logInfo("my-bets", "read marketCount", {
      contract: shieldBetConfig.address,
      marketCount: marketCount?.toString() || "0",
      account: address || ""
    });
  }, [marketCount, address]);

  const ids = useMemo(() => {
    if (marketCount === undefined || marketCount === null) return [] as bigint[];

    const count = Number(marketCount);
    if (!Number.isFinite(count) || count <= 0) return [] as bigint[];

    return Array.from({ length: count }, (_, idx) => BigInt(idx + 1));
  }, [marketCount]);

  const contracts = useMemo(() => {
    if (!address) return [];

    return ids.flatMap((marketId) => [
      {
        ...shieldBetConfig,
        functionName: "markets" as const,
        args: [marketId] as const
      },
      {
        ...shieldBetConfig,
        functionName: "hasPosition" as const,
        args: [marketId, address] as const
      },
      {
        ...shieldBetConfig,
        functionName: "getClaimQuote" as const,
        args: [marketId, address] as const
      },
      {
        ...shieldBetConfig,
        functionName: "getMyOutcome" as const,
        args: [marketId] as const
      },
      {
        ...shieldBetConfig,
        functionName: "stakeAmounts" as const,
        args: [marketId, address] as const
      },
      {
        ...shieldBetConfig,
        functionName: "hasClaimed" as const,
        args: [marketId, address] as const
      }
    ]);
  }, [address, ids]);

  const { data: batch } = useReadContracts({
    contracts,
    query: {
      enabled: Boolean(address && contracts.length)
    }
  });

  useEffect(() => {
    if (!batch?.length) return;
    logInfo("my-bets", "read markets batch", {
      calls: batch.length,
      statuses: batch.map((entry, idx) => ({
        idx,
        status: entry.status
      }))
    });
  }, [batch]);

  useEffect(() => {
    if (!normalizedAddress || !walletClient || !batch?.length) return;
    const userAddress = normalizedAddress;
    const signer = walletClient;
    const batchResults = batch;

    let cancelled = false;
    async function loadPositions() {
      const contractsToDecrypt: { marketId: bigint; handle: `0x${string}` }[] = [];

      for (let i = 0; i < batchResults.length; i += 6) {
        const hasPositionRes = batchResults[i + 1];
        const outcomeRes = batchResults[i + 3];
        const marketId = ids[i / 6];

        if (hasPositionRes?.status !== "success" || !hasPositionRes.result) continue;
        if (outcomeRes?.status !== "success" || !outcomeRes.result) continue;

        contractsToDecrypt.push({
          marketId,
          handle: outcomeRes.result as `0x${string}`
        });
      }

      if (!contractsToDecrypt.length) return;

      try {
        const decrypted = await decryptUserHandles({
          contractAddress: shieldBetConfig.address,
          userAddress,
          walletClient: signer,
          handles: contractsToDecrypt.map((entry) => entry.handle)
        });
        if (cancelled) return;

        const next: Record<string, "YES" | "NO"> = {};
        for (const entry of contractsToDecrypt) {
          const clear = Number(decrypted[entry.handle]);
          if (clear === 1) next[entry.marketId.toString()] = "YES";
          if (clear === 2) next[entry.marketId.toString()] = "NO";
        }
        setDecryptedPositions(next);
      } catch (error) {
        if (!cancelled) {
          logWarn("my-bets", "failed to decrypt positions", {
            account: userAddress,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }

    void loadPositions();
    return () => {
      cancelled = true;
    };
  }, [batch, ids, normalizedAddress, walletClient]);

  const rows = useMemo(() => {
    if (!batch?.length || !address) return [] as MyBetRow[];

    const localByMarket = new Map(localBets.map((bet) => [bet.marketId, bet]));

    const next: MyBetRow[] = [];
    for (let i = 0; i < batch.length; i += 6) {
      const marketRes = batch[i];
      const hasPositionRes = batch[i + 1];
      const claimRes = batch[i + 2];
      const stakeRes = batch[i + 4];
      const hasClaimedRes = batch[i + 5];
      const marketId = ids[i / 6];

      if (
        marketRes?.status !== "success" ||
        !marketRes.result ||
        hasPositionRes?.status !== "success" ||
        !hasPositionRes.result ||
        claimRes?.status !== "success" ||
        !claimRes.result ||
        stakeRes?.status !== "success" ||
        hasClaimedRes?.status !== "success"
      ) {
        continue;
      }

      const market = decodeMarketView(marketRes.result);
      if (!market) {
        continue;
      }

      const claimResult = claimRes.result as readonly [bigint, boolean];
      const local = localByMarket.get(marketId.toString());
      const decryptedPosition = decryptedPositions[marketId.toString()];
      const stakeWei = BigInt((stakeRes.result as bigint | number | string) || 0);
      const position: MyBetRow["position"] = decryptedPosition || local?.position || "Encrypted";
      const canClaim = Boolean(claimResult[1]);
      const hasClaimed = Boolean(hasClaimedRes.result);
      const marketClosed = Date.now() >= Number(market.deadline) * 1000;
      const isCancelled = market.resolved && market.outcome === 3;
      const isResolvedYesNo = market.resolved && (market.outcome === 1 || market.outcome === 2);
      const positionKnown = position === "YES" || position === "NO";
      const userWon =
        (position === "YES" && market.outcome === 1) ||
        (position === "NO" && market.outcome === 2);

      let status: MyBetRow["status"] = "Open";
      let claimType: MyBetRow["claimType"] | undefined;

      if (!market.resolved) {
        status = marketClosed ? "Awaiting Resolution" : "Open";
      } else if (isCancelled) {
        claimType = "refund";
        status = hasClaimed ? "Refunded" : canClaim ? "Refund Available" : "Cancelled";
      } else if (isResolvedYesNo) {
        claimType = "winnings";
        if (hasClaimed) {
          status = "Claimed";
        } else if (canClaim) {
          status = "Won";
        } else if (!positionKnown) {
          status = "Resolved";
        } else if (userWon) {
          status = "Awaiting Payout";
        } else {
          status = "Lost";
        }
      }

      next.push({
        marketId,
        question: market.question,
        position,
        amountWei: stakeWei.toString(),
        status,
        canClaim,
        claimType
      });
    }

    return next;
  }, [address, batch, decryptedPositions, ids, localBets]);

  useEffect(() => {
    logInfo("my-bets", "parsed rows", {
      count: rows.length,
      rows: rows.map((row) => ({
        marketId: row.marketId.toString(),
        question: row.question,
        position: row.position,
        amountWei: row.amountWei,
        status: row.status,
        canClaim: row.canClaim,
        claimType: row.claimType || ""
      }))
    });
  }, [rows]);

  return (
    <section className="space-y-5">
      <div className="surface p-6 md:p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 md:text-4xl">My Bets</h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-600 dark:text-slate-300 md:text-base">
          Portfolio view of your ShieldBet v1 positions. Your ETH stake is public on-chain; your side is decrypted locally when your wallet can sign.
        </p>
        <p className="mt-2 max-w-2xl text-xs text-slate-500 dark:text-slate-400">
          If wallet signing is unavailable, side recovery falls back to this browser&apos;s local record.
        </p>
      </div>

      {!address ? (
        <div className="surface p-8 text-center">
          <p className="subtle">Connect wallet to view your ShieldBet positions.</p>
        </div>
      ) : (
        <MyBetsTable rows={rows} />
      )}
    </section>
  );
}
