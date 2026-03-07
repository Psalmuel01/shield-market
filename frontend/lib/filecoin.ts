import { keccak256, toHex } from "viem";

export interface MarketMetadataPayload {
  marketId: bigint;
  question: string;
  creator: string;
  deadline: bigint;
  category?: string;
  resolutionCriteria?: string;
}

export interface ResolutionPayload {
  marketId: bigint;
  outcome: number;
  resolver: string;
  timestamp: number;
}

function deterministicMockCid(payload: object): string {
  const hash = keccak256(toHex(JSON.stringify(payload)));
  return `bafy${hash.slice(2, 18)}`;
}

export async function uploadMarketMetadata(payload: MarketMetadataPayload): Promise<string> {
  // Hook point for Synapse SDK integration.
  // Replace this with real Synapse upload in production.
  return deterministicMockCid(payload);
}

export async function uploadResolution(payload: ResolutionPayload): Promise<string> {
  // Hook point for Synapse SDK integration.
  // Replace this with real Synapse upload in production.
  return deterministicMockCid(payload);
}
