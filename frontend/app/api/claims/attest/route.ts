import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, getAddress, http, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { shieldBetAbi } from "@/lib/abi";
import { shieldBetConfig } from "@/lib/contract";

export const runtime = "nodejs";

interface ClaimAttestBody {
  marketId: string;
  account: string;
  decryptedOutcome: number;
}

function getRpcUrl() {
  return process.env.NEXT_PUBLIC_CHAIN_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
}

function getSigningKey() {
  return process.env.SETTLEMENT_SIGNER_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY || "";
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Partial<ClaimAttestBody>;
  if (!body.marketId || !body.account || body.decryptedOutcome === undefined) {
    return NextResponse.json({ error: "Missing claim attestation fields" }, { status: 400 });
  }

  if (!isAddress(body.account)) {
    return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
  }

  const privateKey = getSigningKey();
  if (!privateKey) {
    return NextResponse.json({ error: "Missing SETTLEMENT_SIGNER_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY" }, { status: 500 });
  }

  const marketId = BigInt(body.marketId);
  const claimant = getAddress(body.account);
  const publicClient = createPublicClient({ transport: http(getRpcUrl()) });

  const market = await publicClient.readContract({
    ...shieldBetConfig,
    functionName: "markets",
    args: [marketId]
  });
  const details = await publicClient.readContract({
    ...shieldBetConfig,
    functionName: "getMarketDetails",
    args: [marketId]
  });
  const stakeAmount = await publicClient.readContract({
    ...shieldBetConfig,
    functionName: "stakeAmounts",
    args: [marketId, claimant]
  });
  const alreadyClaimed = await publicClient.readContract({
    ...shieldBetConfig,
    functionName: "hasClaimed",
    args: [marketId, claimant]
  });
  const signerAddress = await publicClient.readContract({
    ...shieldBetConfig,
    functionName: "settlementSigner"
  });

  const [
    ,,
    outcome,
    status,
    ,,
    ,,
    seedLiquidity,
    ,
  ] = market as readonly [string, bigint, number, number, number, number, `0x${string}`, bigint, bigint, `0x${string}`, bigint, number, `0x${string}`, `0x${string}`, bigint];

  const [,,,,,, , , publishedWinningTotal, , winningTotalIsPublished] = details as readonly [string, string, string, string, number, `0x${string}`, bigint, bigint, bigint, boolean, boolean];

  if (status !== 4) {
    return NextResponse.json({ error: "Market is not finalized yet" }, { status: 409 });
  }

  if (!winningTotalIsPublished || publishedWinningTotal === 0n) {
    return NextResponse.json({ error: "Winning total has not been published yet" }, { status: 409 });
  }

  if (stakeAmount === 0n) {
    return NextResponse.json({ error: "No stake found for this wallet" }, { status: 404 });
  }

  if (alreadyClaimed) {
    return NextResponse.json({ error: "This wallet has already claimed" }, { status: 409 });
  }

  if (Number(body.decryptedOutcome) !== Number(outcome)) {
    return NextResponse.json({ error: "Recovered outcome does not match the finalized market outcome" }, { status: 403 });
  }

  const totalPool = await publicClient.readContract({
    ...shieldBetConfig,
    functionName: "totalPool",
    args: [marketId]
  });

  const fee = (totalPool * 500n) / 10_000n;
  const expectedPayoutWei = (stakeAmount * (totalPool + seedLiquidity - fee)) / publishedWinningTotal;
  const payoutDeadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20);

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  if (getAddress(account.address) !== getAddress(signerAddress)) {
    return NextResponse.json({ error: "Configured signer does not match on-chain settlementSigner" }, { status: 500 });
  }

  const signature = await account.signTypedData({
    domain: {
      name: "ShieldBet",
      version: "2",
      chainId: await publicClient.getChainId(),
      verifyingContract: shieldBetConfig.address
    },
    types: {
      ClaimAttestation: [
        { name: "marketId", type: "uint256" },
        { name: "claimant", type: "address" },
        { name: "resolvedOutcome", type: "uint8" },
        { name: "winningTotal", type: "uint256" },
        { name: "payoutDeadline", type: "uint256" }
      ]
    },
    primaryType: "ClaimAttestation",
    message: {
      marketId,
      claimant,
      resolvedOutcome: Number(outcome),
      winningTotal: publishedWinningTotal,
      payoutDeadline
    }
  });

  return NextResponse.json({
    marketId: marketId.toString(),
    claimant,
    resolvedOutcome: Number(outcome),
    winningTotal: publishedWinningTotal.toString(),
    payoutDeadline: payoutDeadline.toString(),
    expectedPayoutWei: expectedPayoutWei.toString(),
    seedLiquidity: seedLiquidity.toString(),
    signature
  });
}
