import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, decodeEventLog, getAddress, http, isAddress, parseAbiItem } from "viem";
import { shieldBetAbi } from "@/lib/abi";
import { shieldBetConfig } from "@/lib/contract";
import { logError, logInfo } from "@/lib/telemetry";

interface ClaimRequest {
  marketId: string;
  account: string;
  txHash: string;
  resolvedOutcome?: string;
  expectedPayoutWei: string;
  litActionCid?: string;
  litResponse?: unknown;
  litLogs?: string;
}

interface LitAttestationPayload {
  eligible?: unknown;
  account?: unknown;
  marketId?: unknown;
  resolvedOutcome?: unknown;
  expectedPayoutWei?: unknown;
  txHash?: unknown;
  verifier?: unknown;
  actionCid?: unknown;
  network?: unknown;
  issuedAt?: unknown;
  checks?: unknown;
}

export const runtime = "nodejs";

const winningsClaimedEvent = parseAbiItem(
  "event WinningsClaimed(uint256 indexed marketId, address indexed winner, uint256 payoutAmount, uint8 assetType)"
);

function getRpcUrl() {
  return process.env.NEXT_PUBLIC_CHAIN_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") return String(value);
  return undefined;
}

function unwrapLitResponse(value: unknown): unknown {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return value;
    try {
      return unwrapLitResponse(JSON.parse(trimmed));
    } catch {
      return value;
    }
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ("response" in record && record.response !== value) {
      return unwrapLitResponse(record.response);
    }
  }

  return value;
}

function parseLitAttestation(body: Partial<ClaimRequest>) {
  if (!body.litActionCid || !body.litResponse) return null;

  const normalized = unwrapLitResponse(body.litResponse);
  if (!normalized || typeof normalized !== "object") return null;

  const root = normalized as Record<string, unknown>;
  const candidate =
    root.attestation && typeof root.attestation === "object"
      ? (root.attestation as LitAttestationPayload)
      : (root as LitAttestationPayload);

  const checks = Array.isArray(candidate.checks)
    ? candidate.checks.map((entry) => asString(entry)).filter((entry): entry is string => Boolean(entry))
    : [];

  return {
    account: asString(candidate.account),
    marketId: asString(candidate.marketId),
    resolvedOutcome: asString(candidate.resolvedOutcome),
    expectedPayoutWei: asString(candidate.expectedPayoutWei),
    txHash: asString(candidate.txHash),
    verifier: asString(candidate.verifier) || "lit-action",
    actionCid: asString(candidate.actionCid) || body.litActionCid,
    network: asString(candidate.network) || (process.env.NEXT_PUBLIC_LIT_NETWORK || "naga-test"),
    issuedAt: asString(candidate.issuedAt) || new Date().toISOString(),
    checks
  };
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Partial<ClaimRequest>;
  logInfo("claim-api", "incoming verify request", body);

  if (!body.marketId || !body.account || !body.txHash) {
    return NextResponse.json({ error: "Missing claim payload fields" }, { status: 400 });
  }

  if (!isAddress(body.account)) {
    return NextResponse.json({ error: "Invalid account address" }, { status: 400 });
  }

  let expectedMarketId: bigint;
  let expectedPayoutWei: bigint;
  let expectedResolvedOutcome = 0;
  try {
    expectedMarketId = BigInt(body.marketId);
    expectedPayoutWei = body.expectedPayoutWei ? BigInt(body.expectedPayoutWei) : 0n;
    expectedResolvedOutcome = body.resolvedOutcome ? Number(body.resolvedOutcome) : 0;
  } catch {
    return NextResponse.json({ error: "Invalid numeric claim payload values" }, { status: 400 });
  }

  const normalizedAccount = getAddress(body.account);

  const publicClient = createPublicClient({
    transport: http(getRpcUrl())
  });
  logInfo("claim-api", "client configured", {
    rpcUrl: getRpcUrl()
  });

  if (shieldBetConfig.address === "0x0000000000000000000000000000000000000000") {
    return NextResponse.json({ error: "NEXT_PUBLIC_SHIELDBET_ADDRESS is not configured" }, { status: 500 });
  }

  let marketRecord;
  try {
    marketRecord = await publicClient.readContract({
      address: shieldBetConfig.address,
      abi: shieldBetAbi,
      functionName: "markets",
      args: [expectedMarketId]
    });
  } catch (error) {
    logError("claim-api", "failed reading market state", {
      marketId: expectedMarketId.toString(),
      error: error instanceof Error ? error.message : String(error)
    });
    return NextResponse.json({ error: "Unable to read market state for verification" }, { status: 400 });
  }

  const onchainOutcome = Array.isArray(marketRecord)
    ? Number(marketRecord[2])
    : Number((marketRecord as { outcome?: unknown }).outcome || 0);
  const onchainStatus = Array.isArray(marketRecord)
    ? Number(marketRecord[3])
    : Number((marketRecord as { status?: unknown }).status || 0);
  const onchainResolved = onchainStatus === 4;

  if (!onchainResolved) {
    return NextResponse.json({ error: "Market is not resolved on-chain" }, { status: 409 });
  }

  if (expectedResolvedOutcome > 0 && onchainOutcome !== expectedResolvedOutcome) {
    return NextResponse.json(
      {
        error: `Resolved outcome mismatch: expected ${expectedResolvedOutcome} got ${onchainOutcome}`
      },
      { status: 409 }
    );
  }

  let receipt;
  try {
    receipt = await publicClient.getTransactionReceipt({
      hash: body.txHash as `0x${string}`
    });
    logInfo("claim-api", "tx receipt loaded", {
      txHash: body.txHash,
      status: receipt.status,
      logsCount: receipt.logs.length
    });
  } catch {
    logError("claim-api", "failed fetching receipt", {
      txHash: body.txHash
    });
    return NextResponse.json({ error: "Unable to fetch claim transaction receipt" }, { status: 400 });
  }

  if (receipt.status !== "success") {
    return NextResponse.json({ error: "Claim transaction reverted" }, { status: 400 });
  }

  let claimedPayout = 0n;
  let matchedClaim = false;
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: [winningsClaimedEvent],
        data: log.data,
        topics: log.topics
      });

      const marketId = decoded.args.marketId as bigint;
      const winner = getAddress(String(decoded.args.winner));
      const payout = decoded.args.payoutAmount as bigint;

      if (marketId === expectedMarketId && winner === normalizedAccount) {
        claimedPayout = payout;
        matchedClaim = true;
        break;
      }
    } catch {
      continue;
    }
  }

  if (!matchedClaim) {
    logError("claim-api", "no matching claim event", {
      txHash: body.txHash,
      expectedMarketId: expectedMarketId.toString(),
      expectedAccount: normalizedAccount
    });
    return NextResponse.json({ error: "No matching WinningsClaimed event found in receipt" }, { status: 400 });
  }

  if (expectedPayoutWei > 0n && claimedPayout !== expectedPayoutWei) {
    logError("claim-api", "claim payout mismatch", {
      txHash: body.txHash,
      expectedPayoutWei: expectedPayoutWei.toString(),
      claimedPayoutWei: claimedPayout.toString()
    });
    return NextResponse.json({
      error: `Claim payout mismatch: expected ${expectedPayoutWei.toString()} got ${claimedPayout.toString()}`
    }, { status: 409 });
  }

  const hasLitProof = Boolean(body.litActionCid && body.litResponse);
  const litAttestation = parseLitAttestation(body);
  const verifiedChecks = [
    "market is resolved on-chain",
    "claim event matches wallet and market",
    "claimed payout matches quote",
    ...(hasLitProof ? ["Lit Action attestation attached"] : [])
  ];

  const response = {
    mode: hasLitProof ? "lit" : "verify",
    txHash: body.txHash,
    actionCid: hasLitProof ? body.litActionCid : undefined,
    plaintextPayoutWei: claimedPayout.toString(),
    verifiedMarketId: expectedMarketId.toString(),
    verifiedAccount: normalizedAccount,
    verifiedOutcome: onchainOutcome.toString(),
    verifiedChecks,
    litAttestation: hasLitProof && litAttestation ? litAttestation : undefined,
    litResponse: hasLitProof ? body.litResponse : undefined,
    litLogs: hasLitProof ? body.litLogs || "" : undefined
  };
  logInfo("claim-api", "verify response", response);
  return NextResponse.json(response);
}
