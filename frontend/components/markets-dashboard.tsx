"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { MarketCard } from "@/components/market-card";
import { shieldBetConfig } from "@/lib/contract";
import { decodeMarketDetails, decodeMarketView } from "@/lib/market-contract";
import { coerceMarketCategory, getEncryptedBandCount, inferCategory, MarketCategory } from "@/lib/market-ui";

type MarketTab = "All" | "Crypto" | "Politics" | "Sports" | "Science" | "My Markets";
type SortOption = "Closing Soon" | "Newest" | "Most Activity";

interface ParsedMarket {
  marketId: bigint;
  question: string;
  deadline: bigint;
  outcome: number;
  status: number;
  marketType: number;
  assetType: number;
  creator: `0x${string}`;
  metadataCid: string;
  resolutionCid: string;
  category: MarketCategory;
  encryptedActivity: number;
  poolBalanceWei: bigint;
}

const tabs: MarketTab[] = ["All", "Crypto", "Politics", "Sports", "Science", "My Markets"];
const sortOptions: SortOption[] = ["Closing Soon", "Newest", "Most Activity"];

export function MarketsDashboard() {
  const { address } = useAccount();
  const [activeTab, setActiveTab] = useState<MarketTab>("All");
  const [sortBy, setSortBy] = useState<SortOption>("Closing Soon");
  const [search, setSearch] = useState("");

  const { data: marketCount, isLoading: loadingCount } = useReadContract({
    ...shieldBetConfig,
    functionName: "marketCount"
  });

  const ids = useMemo(() => {
    if (!marketCount) return [] as bigint[];
    const count = Number(marketCount);
    return Array.from({ length: count }, (_, idx) => BigInt(idx + 1));
  }, [marketCount]);

  const contracts = useMemo(
    () =>
      ids.flatMap((marketId) => [
        { ...shieldBetConfig, functionName: "markets" as const, args: [marketId] as const },
        { ...shieldBetConfig, functionName: "marketMetadataCID" as const, args: [marketId] as const },
        { ...shieldBetConfig, functionName: "getMarketDetails" as const, args: [marketId] as const },
        { ...shieldBetConfig, functionName: "marketResolutionCID" as const, args: [marketId] as const },
        { ...shieldBetConfig, functionName: "marketPoolBalance" as const, args: [marketId] as const }
      ]),
    [ids]
  );

  const { data: marketBatch, isLoading: loadingMarkets } = useReadContracts({
    contracts,
    query: { enabled: contracts.length > 0 }
  });

  const markets = useMemo(() => {
    if (!marketBatch?.length) return [] as ParsedMarket[];

    const rows: ParsedMarket[] = [];
    for (let i = 0; i < marketBatch.length; i += 5) {
      const marketRes = marketBatch[i];
      const metadataRes = marketBatch[i + 1];
      const detailsRes = marketBatch[i + 2];
      const resolutionRes = marketBatch[i + 3];
      const poolBalanceRes = marketBatch[i + 4];
      const marketId = ids[i / 5];

      if (marketRes?.status !== "success" || !marketRes.result) continue;
      const market = decodeMarketView(marketRes.result);
      if (!market) continue;

      const details = detailsRes?.status === "success" ? decodeMarketDetails(detailsRes.result) : null;
      const category = details?.category.trim() ? coerceMarketCategory(details.category.trim()) : inferCategory(market.question);

      rows.push({
        marketId,
        question: market.question,
        deadline: market.deadline,
        outcome: market.outcome,
        status: market.status,
        marketType: market.marketType,
        assetType: market.assetType,
        creator: market.creator,
        metadataCid: metadataRes?.status === "success" && metadataRes.result ? String(metadataRes.result) : "",
        resolutionCid: resolutionRes?.status === "success" && resolutionRes.result ? String(resolutionRes.result) : "",
        category,
        encryptedActivity: getEncryptedBandCount(marketId),
        poolBalanceWei: poolBalanceRes?.status === "success" && typeof poolBalanceRes.result === "bigint" ? poolBalanceRes.result : 0n
      });
    }

    return rows;
  }, [ids, marketBatch]);

  const totalEscrow = useMemo(
    () => markets.reduce((acc, market) => acc + Number(market.poolBalanceWei), 0),
    [markets]
  );

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

    if (search.trim()) {
      const query = search.trim().toLowerCase();
      next = next.filter((market) => market.question.toLowerCase().includes(query));
    }

    if (sortBy === "Closing Soon") {
      next = [...next].sort((a, b) => Number(a.deadline - b.deadline));
    } else if (sortBy === "Newest") {
      next = [...next].sort((a, b) => Number(b.marketId - a.marketId));
    } else {
      next = [...next].sort((a, b) => b.encryptedActivity - a.encryptedActivity);
    }

    return next;
  }, [activeTab, address, markets, search, sortBy]);

  if (loadingCount || loadingMarkets) {
    return (
      <div className="vm-card p-12 text-center">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
        <p className="mt-4 text-base font-semibold text-white/72">Loading markets and lifecycle state from the confidential execution layer...</p>
      </div>
    );
  }

  return (
    <section className="vm-page">
      <div className="vm-card overflow-hidden">
        <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="relative">
              {/* <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" /> */}
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search markets..."
                className="vm-input pl-11"
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`vm-soft-btn min-h-0 px-4 py-2 text-[11px] uppercase tracking-[0.18em] ${activeTab === tab ? "border-[var(--primary)]/24 bg-[var(--primary)]/12 text-[var(--primary)]" : ""}`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 rounded-[1.4rem] border border-white/6 bg-white/[0.03] p-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Active</div>
              <div className="mt-2 font-mono text-2xl font-bold text-white dark:text-white">{markets.length}</div>
            </div>
            <div className="h-10 w-px bg-white/8" />
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Volume</div>
              <div className="mt-2 font-mono text-2xl font-bold text-[var(--success)]">{(totalEscrow / 1e18).toFixed(2)} ETH</div>
            </div>
            <div className="h-10 w-px bg-white/8" />
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Sort</div>
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortOption)} className="vm-select mt-2 min-w-[11rem] py-2">
                {sortOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {!filtered.length ? (
        <div className="vm-card p-16 text-center">
          <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full border border-white/6 bg-white/[0.03] text-2xl">🔒</div>
          <h2 className="font-display mt-6 text-2xl font-bold text-white">No markets found</h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-white/55">
            Your current filters returned nothing. Try another category, clear the search, or create a new market.
          </p>
        </div>
      ) : (
        <div className="vm-grid cols-3">
          {filtered.map((market) => (
            <MarketCard key={market.marketId.toString()} {...market} />
          ))}
        </div>
      )}
    </section>
  );
}
