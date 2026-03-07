"use client";

import { useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { shieldBetConfig } from "@/lib/contract";
import { MarketCard } from "@/components/market-card";

interface ParsedMarket {
  marketId: bigint;
  question: string;
  deadline: bigint;
  outcome: number;
  resolved: boolean;
  metadataCid: string;
  resolutionCid: string;
}

export function MarketsDashboard() {
  const { data: marketCount, isLoading: loadingCount } = useReadContract({
    ...shieldBetConfig,
    functionName: "marketCount"
  });

  const ids = useMemo(() => {
    if (!marketCount) return [] as bigint[];
    return Array.from({ length: Number(marketCount) }, (_, idx) => BigInt(idx + 1));
  }, [marketCount]);

  const contracts = useMemo(
    () =>
      ids.flatMap((marketId) => [
        {
          ...shieldBetConfig,
          functionName: "markets" as const,
          args: [marketId] as const
        },
        {
          ...shieldBetConfig,
          functionName: "marketMetadataCID" as const,
          args: [marketId] as const
        },
        {
          ...shieldBetConfig,
          functionName: "marketResolutionCID" as const,
          args: [marketId] as const
        }
      ]),
    [ids]
  );

  const { data: marketBatch, isLoading: loadingMarkets, error } = useReadContracts({
    contracts,
    query: {
      enabled: contracts.length > 0
    }
  });

  const markets = useMemo(() => {
    if (!marketBatch?.length) return [] as ParsedMarket[];

    const rows: ParsedMarket[] = [];
    for (let i = 0; i < marketBatch.length; i += 3) {
      const marketRes = marketBatch[i];
      const metadataRes = marketBatch[i + 1];
      const resolutionRes = marketBatch[i + 2];

      if (marketRes?.status !== "success" || !marketRes.result) continue;

      const market = marketRes.result as {
        question: string;
        deadline: bigint;
        outcome: number;
        resolved: boolean;
        totalYes: bigint;
        totalNo: bigint;
        creator: `0x${string}`;
      };
      rows.push({
        marketId: ids[i / 3],
        question: market.question,
        deadline: market.deadline,
        outcome: market.outcome,
        resolved: market.resolved,
        metadataCid: metadataRes?.status === "success" && metadataRes.result ? String(metadataRes.result) : "",
        resolutionCid: resolutionRes?.status === "success" && resolutionRes.result ? String(resolutionRes.result) : ""
      });
    }

    return rows;
  }, [ids, marketBatch]);

  if (loadingCount || loadingMarkets) {
    return <p className="loading-text">Loading encrypted markets...</p>;
  }

  if (error) {
    return <p className="error-text">Unable to load markets. Confirm contract address and RPC in `.env.local`.</p>;
  }

  if (!markets.length) {
    return (
      <div className="empty-state">
        <h2>No markets yet</h2>
        <p>Create your first market from the admin wallet using the contract function `createMarket`.</p>
      </div>
    );
  }

  return (
    <div className="market-grid">
      {markets.map((market) => (
        <MarketCard key={market.marketId.toString()} {...market} />
      ))}
    </div>
  );
}
