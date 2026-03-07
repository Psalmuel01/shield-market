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
  txHash?: string;
  question?: string;
}

export interface FilecoinUploadResult {
  cid: string;
  kind: "market-metadata" | "market-resolution";
  provider: "synapse" | "mock";
  network: string;
}

async function uploadToFilecoin(kind: FilecoinUploadResult["kind"], payload: Record<string, unknown>): Promise<FilecoinUploadResult> {
  const response = await fetch("/api/filecoin/upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      kind,
      payload
    })
  });

  const body = (await response.json()) as Partial<FilecoinUploadResult> & { error?: string };
  if (!response.ok) {
    throw new Error(body.error || "Filecoin upload failed");
  }

  if (!body.cid || !body.kind || !body.provider) {
    throw new Error("Invalid Filecoin upload response");
  }

  return {
    cid: body.cid,
    kind: body.kind,
    provider: body.provider,
    network: body.network || "calibration"
  };
}

export async function uploadMarketMetadata(payload: MarketMetadataPayload): Promise<FilecoinUploadResult> {
  return uploadToFilecoin("market-metadata", {
    marketId: payload.marketId.toString(),
    question: payload.question,
    creator: payload.creator,
    deadline: payload.deadline.toString(),
    category: payload.category || "Other",
    resolutionCriteria: payload.resolutionCriteria || ""
  });
}

export async function uploadResolution(payload: ResolutionPayload): Promise<FilecoinUploadResult> {
  return uploadToFilecoin("market-resolution", {
    marketId: payload.marketId.toString(),
    outcome: payload.outcome,
    resolver: payload.resolver,
    timestamp: payload.timestamp,
    txHash: payload.txHash || "",
    question: payload.question || ""
  });
}
