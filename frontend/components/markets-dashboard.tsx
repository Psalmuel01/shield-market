"use client";

import { useMemo, useState } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { MarketCard } from "@/components/market-card";
import { shieldBetConfig } from "@/lib/contract";
import { getEncryptedBandCount, inferCategory, MarketCategory } from "@/lib/market-ui";

type MarketTab = "All" | "Crypto" | "Politics" | "Sports" | "Science" | "My Markets";
type SortOption = "Closing Soon" | "Newest" | "Most Activity";

interface ParsedMarket {
  marketId: bigint;
  question: string;
  deadline: bigint;
  outcome: number;
  resolved: boolean;
  creator: `0x${string}`;
  metadataCid: string;
  resolutionCid: string;
  category: MarketCategory;
  encryptedActivity: number;
}

const tabs: MarketTab[] = ["All", "Crypto", "Politics", "Sports", "Science", "My Markets"];
const sortOptions: SortOption[] = ["Closing Soon", "Newest", "Most Activity"];

export function MarketsDashboard() {
  const { address } = useAccount();
  const [activeTab, setActiveTab] = useState<MarketTab>("All");
  const [sortBy, setSortBy] = useState<SortOption>("Closing Soon");

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
      const marketId = ids[i / 3];

      if (marketRes?.status !== "success" || !marketRes.result) continue;

      const market = marketRes.result as {
        question: string;
        deadline: bigint;
        outcome: number;
        resolved: boolean;
        totalYes: `0x${string}`;
        totalNo: `0x${string}`;
        creator: `0x${string}`;
      };

      rows.push({
        marketId,
        question: market.question,
        deadline: market.deadline,
        outcome: market.outcome,
        resolved: market.resolved,
        creator: market.creator,
        metadataCid: metadataRes?.status === "success" && metadataRes.result ? String(metadataRes.result) : "",
        resolutionCid: resolutionRes?.status === "success" && resolutionRes.result ? String(resolutionRes.result) : "",
        category: inferCategory(market.question),
        encryptedActivity: getEncryptedBandCount(marketId)
      });
    }

    return rows;
  }, [ids, marketBatch]);

  const filtered = useMemo(() => {
    let next = markets;

    if (activeTab !== "All") {
      if (activeTab === "My Markets") {
        const owner = address?.toLowerCase();
        next = owner ? next.filter((market) => market.creator.toLowerCase() === owner) : [];
      } else {
        next = next.filter((market) => market.category === activeTab);
      }
    }

    if (sortBy === "Closing Soon") {
      next = [...next].sort((a, b) => Number(a.deadline - b.deadline));
    } else if (sortBy === "Newest") {
      next = [...next].sort((a, b) => Number(b.marketId - a.marketId));
    } else {
      next = [...next].sort((a, b) => b.encryptedActivity - a.encryptedActivity);
    }

    return next;
  }, [activeTab, address, markets, sortBy]);

  if (loadingCount || loadingMarkets) {
    return <p className="subtle">Loading encrypted markets...</p>;
  }

  if (error) {
    return <p className="text-sm text-rose-500">Unable to load markets. Confirm contract address and RPC in `.env.local`.</p>;
  }

  return (
    <section className="space-y-3">
      <div className="surface p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {tabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  activeTab === tab
                    ? "bg-indigo-500 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-400">
            Sort
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as SortOption)}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              {sortOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="subtle">Encrypted activity bands hide real market size until settlement.</p>
      </div>

      {!filtered.length ? (
        <div className="surface p-8 text-center">
          <h2 className="section-title mb-2">No markets found</h2>
          <p className="subtle">Try another filter, or create your first confidential market.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((market) => (
            <MarketCard key={market.marketId.toString()} {...market} />
          ))}
        </div>
      )}
    </section>
  );
}
