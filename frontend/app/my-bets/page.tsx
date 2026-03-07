"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { MyBetRow, MyBetsTable } from "@/components/my-bets-table";
import { shieldBetConfig } from "@/lib/contract";
import { getLocalBetsByWallet, LocalBetRecord } from "@/lib/local-bets";

export default function MyBetsPage() {
  const { address } = useAccount();
  const [localBets, setLocalBets] = useState<LocalBetRecord[]>([]);

  useEffect(() => {
    setLocalBets(getLocalBetsByWallet(address));
  }, [address]);

  const { data: marketCount } = useReadContract({
    ...shieldBetConfig,
    functionName: "marketCount"
  });

  const ids = useMemo(() => {
    if (!marketCount) return [] as bigint[];
    return Array.from({ length: Number(marketCount) }, (_, idx) => BigInt(idx + 1));
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
      }
    ]);
  }, [address, ids]);

  const { data: batch } = useReadContracts({
    contracts,
    query: {
      enabled: Boolean(address && contracts.length)
    }
  });

  const rows = useMemo(() => {
    if (!batch?.length || !address) return [] as MyBetRow[];

    const localByMarket = new Map(localBets.map((bet) => [bet.marketId, bet]));

    const next: MyBetRow[] = [];
    for (let i = 0; i < batch.length; i += 3) {
      const marketRes = batch[i];
      const hasPositionRes = batch[i + 1];
      const claimRes = batch[i + 2];
      const marketId = ids[i / 3];

      if (
        marketRes?.status !== "success" ||
        !marketRes.result ||
        hasPositionRes?.status !== "success" ||
        !hasPositionRes.result ||
        claimRes?.status !== "success" ||
        !claimRes.result
      ) {
        continue;
      }

      const market = marketRes.result as {
        question: string;
        deadline: bigint;
        outcome: number;
        resolved: boolean;
        totalYes: `0x${string}`;
        totalNo: `0x${string}`;
        creator: `0x${string}`;
      };

      const claimResult = claimRes.result as readonly [bigint, boolean];
      const local = localByMarket.get(marketId.toString());

      const canClaim = Boolean(claimResult[1]);
      const status = market.resolved ? (canClaim ? "Resolved" : "Claimed") : "Open";

      next.push({
        marketId,
        question: market.question,
        position: local?.position || "Encrypted",
        status,
        canClaim
      });
    }

    return next;
  }, [address, batch, ids, localBets]);

  return (
    <section className="space-y-5">
      <div className="surface p-6 md:p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 md:text-4xl">My Bets</h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-600 dark:text-slate-300 md:text-base">
          Portfolio view of your confidential positions. Bet sizes remain encrypted until claim.
        </p>
      </div>

      {!address ? (
        <div className="surface p-8 text-center">
          <p className="subtle">Connect wallet to view your confidential portfolio.</p>
        </div>
      ) : (
        <MyBetsTable rows={rows} />
      )}
    </section>
  );
}
