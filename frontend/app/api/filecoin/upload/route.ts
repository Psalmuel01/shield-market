import { NextRequest, NextResponse } from "next/server";
import { calibration, devnet, mainnet, type Chain } from "@filoz/synapse-core/chains";
import { Synapse } from "@filoz/synapse-sdk";
import { privateKeyToAccount } from "viem/accounts";
import { http, keccak256, toHex } from "viem";

type UploadKind = "market-metadata" | "market-resolution";

interface UploadRequestBody {
  kind: UploadKind;
  payload: Record<string, unknown>;
}

export const runtime = "nodejs";

function deterministicMockCid(payload: object): string {
  const hash = keccak256(toHex(JSON.stringify(payload)));
  return `bafy${hash.slice(2, 18)}`;
}

function resolveFilecoinChain(network: string): Chain {
  if (network === "mainnet") return mainnet;
  if (network === "devnet") return devnet;
  return calibration;
}

async function uploadWithSynapse(payload: Record<string, unknown>): Promise<string> {
  const walletPrivateKey = process.env.FILECOIN_WALLET_PRIVATE_KEY as `0x${string}` | undefined;
  if (!walletPrivateKey) {
    throw new Error("FILECOIN_WALLET_PRIVATE_KEY is not set");
  }

  const chain = resolveFilecoinChain(process.env.FILECOIN_NETWORK || "calibration");
  const account = privateKeyToAccount(walletPrivateKey);
  const transport = process.env.FILECOIN_RPC_URL ? http(process.env.FILECOIN_RPC_URL) : http();

  const synapse = Synapse.create({
    account,
    chain,
    transport,
    withCDN: process.env.FILECOIN_WITH_CDN === "true"
  });

  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const result = await synapse.storage.upload(bytes, {
    pieceMetadata: {
      app: "shieldbet",
      schema: "shieldbet.filecoin.v1",
      uploadedAt: new Date().toISOString()
    }
  });

  return result.pieceCid.toString();
}

export async function POST(request: NextRequest) {
  let body: UploadRequestBody;

  try {
    body = (await request.json()) as UploadRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (!body?.kind || !body?.payload || (body.kind !== "market-metadata" && body.kind !== "market-resolution")) {
    return NextResponse.json({ error: "Missing or invalid upload payload" }, { status: 400 });
  }

  const uploadEnvelope = {
    version: 1,
    kind: body.kind,
    uploadedAt: new Date().toISOString(),
    payload: body.payload
  };

  const mode = process.env.FILECOIN_UPLOAD_MODE || "synapse";
  if (mode === "mock") {
    const cid = deterministicMockCid(uploadEnvelope);
    return NextResponse.json({
      cid,
      kind: body.kind,
      provider: "mock",
      network: process.env.FILECOIN_NETWORK || "calibration"
    });
  }

  try {
    const cid = await uploadWithSynapse(uploadEnvelope);
    return NextResponse.json({
      cid,
      kind: body.kind,
      provider: "synapse",
      network: process.env.FILECOIN_NETWORK || "calibration"
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Filecoin upload failed"
      },
      { status: 500 }
    );
  }
}
