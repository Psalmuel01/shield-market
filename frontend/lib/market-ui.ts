export type MarketCategory = "Crypto" | "Politics" | "Sports" | "Science" | "Other";
export type MarketStatus = "Open" | "Closing Soon" | "Resolved";

const CATEGORY_KEYWORDS: Record<Exclude<MarketCategory, "Other">, string[]> = {
  Crypto: ["eth", "btc", "bitcoin", "sol", "crypto", "token", "defi", "ethereum", "market cap"],
  Politics: ["election", "president", "senate", "congress", "vote", "policy", "campaign"],
  Sports: ["nba", "nfl", "mlb", "nhl", "world cup", "champion", "match", "win"],
  Science: ["ai", "nasa", "spacex", "breakthrough", "research", "trial", "cure"]
};

export function inferCategory(question: string): MarketCategory {
  const q = question.toLowerCase();

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as [Exclude<MarketCategory, "Other">, string[]][]) {
    if (keywords.some((keyword) => q.includes(keyword))) return category;
  }

  return "Other";
}

export function getMarketStatus(deadline: bigint, resolved: boolean): MarketStatus {
  if (resolved) return "Resolved";

  const diffMs = Number(deadline) * 1000 - Date.now();
  if (diffMs <= 24 * 60 * 60 * 1000) return "Closing Soon";
  return "Open";
}

export function getEncryptedBandCount(seed: bigint | number, min = 4, max = 10): number {
  const n = typeof seed === "bigint" ? Number(seed % 997n) : seed;
  const range = max - min + 1;
  return min + ((n * 37 + 17) % range);
}

export function renderEncryptedDots(count: number): string {
  return "●".repeat(Math.max(1, Math.min(10, count)));
}
