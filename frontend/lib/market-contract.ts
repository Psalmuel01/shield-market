export interface DecodedMarketView {
  question: string;
  deadline: bigint;
  outcome: number;
  status: number;
  marketType: number;
  assetType: number;
  quoteToken: `0x${string}`;
  minStake: bigint;
  seedLiquidity: bigint;
  creator: `0x${string}`;
  disputeWindowEnd: bigint;
  proposedOutcome: number;
  proposer: `0x${string}`;
  challenger: `0x${string}`;
  publishedWinningTotal: bigint;
}

export interface DecodedMarketDetails {
  category: string;
  resolutionCriteria: string;
  resolutionSource: string;
  resolutionPolicy: string;
  assetType: number;
  quoteToken: `0x${string}`;
  minStake: bigint;
  seedLiquidity: bigint;
  publishedWinningTotal: bigint;
  totalsOpened: boolean;
  winningTotalIsPublished: boolean;
}

function isAddress(value: unknown): value is `0x${string}` {
  return typeof value === "string" && value.startsWith("0x") && value.length === 42;
}

export function decodeMarketView(result: unknown): DecodedMarketView | null {
  if (!result) return null;

  const asArray = Array.isArray(result) ? result : null;
  if (asArray && asArray.length >= 15) {
    const [
      question, 
      deadline, 
      outcome, 
      status, 
      marketType, 
      assetType,
      quoteToken,
      minStake,
      seedLiquidity,
      creator, 
      disputeWindowEnd, 
      proposedOutcome, 
      proposer, 
      challenger,
      publishedWinningTotal
    ] = asArray as unknown[];

    if (
      typeof question === "string" &&
      typeof deadline === "bigint" &&
      typeof outcome === "number" &&
      typeof status === "number" &&
      typeof marketType === "number" &&
      typeof assetType === "number" &&
      isAddress(quoteToken) &&
      typeof minStake === "bigint" &&
      typeof seedLiquidity === "bigint" &&
      isAddress(creator) &&
      typeof disputeWindowEnd === "bigint" &&
      typeof proposedOutcome === "number" &&
      isAddress(proposer) &&
      isAddress(challenger) &&
      typeof publishedWinningTotal === "bigint"
    ) {
      return {
        question,
        deadline,
        outcome,
        status,
        marketType,
        assetType,
        quoteToken,
        minStake,
        seedLiquidity,
        creator,
        disputeWindowEnd,
        proposedOutcome,
        proposer,
        challenger,
        publishedWinningTotal
      };
    }
  }

  if (typeof result === "object") {
    const market = result as Partial<DecodedMarketView>;
    if (
      typeof market.question === "string" &&
      typeof market.deadline === "bigint" &&
      typeof market.outcome === "number" &&
      typeof market.status === "number" &&
      typeof market.marketType === "number" &&
      typeof market.assetType === "number" &&
      isAddress(market.quoteToken) &&
      typeof market.minStake === "bigint" &&
      typeof market.seedLiquidity === "bigint" &&
      isAddress(market.creator) &&
      typeof market.disputeWindowEnd === "bigint" &&
      typeof market.proposedOutcome === "number" &&
      isAddress(market.proposer) &&
      isAddress(market.challenger) &&
      typeof market.publishedWinningTotal === "bigint"
    ) {
      return market as DecodedMarketView;
    }
  }

  return null;
}

export function decodeMarketDetails(result: unknown): DecodedMarketDetails | null {
  if (!result) return null;

  const asArray = Array.isArray(result) ? result : null;
  if (asArray && asArray.length >= 11) {
    const [
      category,
      resolutionCriteria,
      resolutionSource,
      resolutionPolicy,
      assetType,
      quoteToken,
      minStake,
      seedLiquidity,
      publishedWinningTotal,
      totalsOpened,
      winningTotalIsPublished
    ] = asArray as unknown[];
    if (
      typeof category === "string" &&
      typeof resolutionCriteria === "string" &&
      typeof resolutionSource === "string" &&
      typeof resolutionPolicy === "string" &&
      typeof assetType === "number" &&
      isAddress(quoteToken) &&
      typeof minStake === "bigint" &&
      typeof seedLiquidity === "bigint" &&
      typeof publishedWinningTotal === "bigint" &&
      typeof totalsOpened === "boolean" &&
      typeof winningTotalIsPublished === "boolean"
    ) {
      return {
        category,
        resolutionCriteria,
        resolutionSource,
        resolutionPolicy,
        assetType,
        quoteToken,
        minStake,
        seedLiquidity,
        publishedWinningTotal,
        totalsOpened,
        winningTotalIsPublished
      };
    }
  }

  if (typeof result === "object") {
    const details = result as Partial<DecodedMarketDetails>;
    if (
      typeof details.category === "string" &&
      typeof details.resolutionCriteria === "string" &&
      typeof details.resolutionSource === "string" &&
      typeof details.resolutionPolicy === "string" &&
      typeof details.assetType === "number" &&
      isAddress(details.quoteToken) &&
      typeof details.minStake === "bigint" &&
      typeof details.seedLiquidity === "bigint" &&
      typeof details.publishedWinningTotal === "bigint" &&
      typeof details.totalsOpened === "boolean" &&
      typeof details.winningTotalIsPublished === "boolean"
    ) {
      return details as DecodedMarketDetails;
    }
  }

  return null;
}
