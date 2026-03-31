export type MarketCategory = "Crypto" | "Politics" | "Sports" | "Science" | "Other";
export type MarketStatus = "Active" | "Expired" | "Proposed" | "Disputed" | "Finalized";
export type MarketType = "Binary" | "Categorical";
export type MarketAsset = "ETH" | "USDC";
export interface MarketLifecycleStep {
  key: MarketStatus;
  title: string;
  description: string;
}

const MARKET_CATEGORIES: MarketCategory[] = ["Crypto", "Politics", "Sports", "Science", "Other"];

const CATEGORY_KEYWORDS: Record<Exclude<MarketCategory, "Other">, string[]> = {
  Crypto: ["eth", "btc", "bitcoin", "sol", "crypto", "token", "defi", "ethereum", "market cap"],
  Politics: ["election", "president", "senate", "congress", "vote", "policy", "campaign"],
  Sports: ["nba", "nfl", "mlb", "nhl", "world cup", "champion", "match", "win"],
  Science: ["ai", "nasa", "spacex", "breakthrough", "research", "trial", "cure"]
};

export const MARKET_LIFECYCLE_STEPS: MarketLifecycleStep[] = [
  {
    key: "Active",
    title: "Active",
    description: "Users can place positions while the market is open."
  },
  {
    key: "Expired",
    title: "Expired",
    description: "Betting closes and the market waits for an outcome proposal."
  },
  {
    key: "Proposed",
    title: "Resolution Proposed",
    description: "An oracle has proposed an outcome and posted the oracle stake."
  },
  {
    key: "Disputed",
    title: "Dispute Window",
    description: "The proposed outcome was challenged and requires adjudication."
  },
  {
    key: "Finalized",
    title: "Finalized",
    description: "The outcome is locked and winners can move through settlement."
  }
];

export function inferCategory(question: string): MarketCategory {
  const q = question.toLowerCase();

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as [Exclude<MarketCategory, "Other">, string[]][]) {
    if (keywords.some((keyword) => q.includes(keyword))) return category;
  }

  return "Other";
}

export function coerceMarketCategory(value: string | undefined | null): MarketCategory {
  if (!value) return "Other";
  return MARKET_CATEGORIES.includes(value as MarketCategory) ? (value as MarketCategory) : "Other";
}

export function getMarketStatus(statusInt: number, deadline: bigint): MarketStatus {
  const statuses: MarketStatus[] = ["Active", "Expired", "Proposed", "Disputed", "Finalized"];
  let status = statuses[statusInt] || "Active";

  if (status === "Active" && Number(deadline) * 1000 < Date.now()) {
    return "Expired";
  }

  return status;
}

export function getMarketType(typeInt: number): MarketType {
  return typeInt === 1 ? "Categorical" : "Binary";
}

export function getMarketAsset(assetType: number): MarketAsset {
  return assetType === 1 ? "USDC" : "ETH";
}

export function getMarketLifecycleIndex(status: MarketStatus) {
  return MARKET_LIFECYCLE_STEPS.findIndex((step) => step.key === status);
}

export function getMarketStatusBlurb(status: MarketStatus) {
  return MARKET_LIFECYCLE_STEPS.find((step) => step.key === status)?.description || "";
}

export function getEncryptedBandCount(seed: bigint | number, min = 4, max = 10): number {
  const n = typeof seed === "bigint" ? Number(seed % 997n) : seed;
  const range = max - min + 1;
  return min + ((n * 37 + 17) % range);
}

export function renderEncryptedDots(count: number): string {
  return "●".repeat(Math.max(1, Math.min(10, count)));
}
