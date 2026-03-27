import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, decodeEventLog, getAddress, http, parseAbiItem } from "viem";
import { shieldBetAbi } from "@/lib/abi";
import { shieldBetConfig } from "@/lib/contract";
import { publicDecryptHandles } from "@/lib/fhevm-server";
import { logError, logInfo } from "@/lib/telemetry";

export const runtime = "nodejs";

const betPlacedEvent = parseAbiItem(
  "event BetPlaced(uint256 indexed marketId, address indexed bettor, bytes32 encOutcomeHandle, uint256 stakeAmountWei)"
);

function getRpcUrl() {
  return process.env.NEXT_PUBLIC_CHAIN_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
}

interface ParticipantPlan {
  bettor: `0x${string}`;
  outcome: "YES" | "NO";
  amountWei: string;
  isWinner: boolean;
  projectedPayoutWei: string;
  assignedPayoutWei: string;
  hasClaimed: boolean;
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  let marketId: bigint;
  try {
    marketId = BigInt(id);
  } catch {
    return NextResponse.json({ error: "Invalid market id" }, { status: 400 });
  }

  const publicClient = createPublicClient({
    transport: http(getRpcUrl())
  });

  if (shieldBetConfig.address === "0x0000000000000000000000000000000000000000") {
    return NextResponse.json({ error: "NEXT_PUBLIC_SHIELDBET_ADDRESS is not configured" }, { status: 500 });
  }

  try {
    const [marketRecord, totalPool, marketPoolBalance, reservedPayoutBalance, feeBasisPoints, marketFeeAmount] =
      await Promise.all([
        publicClient.readContract({
          address: shieldBetConfig.address,
          abi: shieldBetAbi,
          functionName: "markets",
          args: [marketId]
        }),
        publicClient.readContract({
          address: shieldBetConfig.address,
          abi: shieldBetAbi,
          functionName: "totalPool",
          args: [marketId]
        }),
        publicClient.readContract({
          address: shieldBetConfig.address,
          abi: shieldBetAbi,
          functionName: "marketPoolBalance",
          args: [marketId]
        }),
        publicClient.readContract({
          address: shieldBetConfig.address,
          abi: shieldBetAbi,
          functionName: "reservedPayoutBalance",
          args: [marketId]
        }),
        publicClient.readContract({
          address: shieldBetConfig.address,
          abi: shieldBetAbi,
          functionName: "feeBasisPoints",
          args: [marketId]
        }),
        publicClient.readContract({
          address: shieldBetConfig.address,
          abi: shieldBetAbi,
          functionName: "marketFeeAmount",
          args: [marketId]
        })
      ]);

    const resolved = Array.isArray(marketRecord) ? Boolean(marketRecord[3]) : false;
    const outcome = Array.isArray(marketRecord) ? Number(marketRecord[2]) : 0;
    if (!resolved || (outcome !== 1 && outcome !== 2)) {
      return NextResponse.json({ error: "Market is not resolved yet" }, { status: 409 });
    }

    const logs = await publicClient.getLogs({
      address: shieldBetConfig.address,
      event: betPlacedEvent,
      args: {
        marketId
      },
      fromBlock: 0n,
      toBlock: "latest"
    });

    const participants = logs.map((log) => {
      const decoded = decodeEventLog({
        abi: [betPlacedEvent],
        data: log.data,
        topics: log.topics
      });

      return {
        bettor: getAddress(String(decoded.args.bettor)),
        encOutcomeHandle: decoded.args.encOutcomeHandle as `0x${string}`,
        stakeAmountWei: BigInt(decoded.args.stakeAmountWei as bigint | string | number)
      };
    });

    if (!participants.length) {
      return NextResponse.json({
        marketId: marketId.toString(),
        resolvedOutcome: outcome === 1 ? "YES" : "NO",
        totalPoolWei: totalPool.toString(),
        marketPoolBalanceWei: marketPoolBalance.toString(),
        reservedPayoutBalanceWei: reservedPayoutBalance.toString(),
        feeBasisPoints: feeBasisPoints.toString(),
        feeWei: marketFeeAmount.toString(),
        distributablePoolWei: (totalPool - marketFeeAmount).toString(),
        totalWinningSideWei: "0",
        participants: [] satisfies ParticipantPlan[]
      });
    }

    const allHandles = participants.map((participant) => participant.encOutcomeHandle);

    let decrypted: Record<`0x${string}`, bigint | number | boolean | string>;
    try {
      decrypted = await publicDecryptHandles(allHandles);
    } catch (error) {
      logError("settlement-api", "public decrypt failed", {
        marketId: marketId.toString(),
        error: error instanceof Error ? error.message : String(error)
      });

      return NextResponse.json(
        {
          error: "Settlement data is not public yet. Open settlement data from the owner panel first.",
          bettors: participants.map((participant) => participant.bettor)
        },
        { status: 409 }
      );
    }

    const winningOutcome = outcome === 1 ? "YES" : "NO";
    const feeWei = marketFeeAmount > 0n ? marketFeeAmount : (totalPool * feeBasisPoints) / 10_000n;
    const distributablePoolWei = totalPool - feeWei;

    const clearParticipants = participants.map((participant) => {
      const clearOutcome = Number(decrypted[participant.encOutcomeHandle]);
      const participantOutcome: "YES" | "NO" = clearOutcome === 1 ? "YES" : "NO";

      return {
        bettor: participant.bettor,
        outcome: participantOutcome,
        amountWei: participant.stakeAmountWei,
        isWinner: participantOutcome === winningOutcome
      };
    });

    const totalWinningSideWei = clearParticipants.reduce((sum, participant) => {
      return participant.isWinner ? sum + participant.amountWei : sum;
    }, 0n);

    const winnerContracts = clearParticipants
      .filter((participant) => participant.isWinner)
      .flatMap((participant) => [
        {
          address: shieldBetConfig.address,
          abi: shieldBetAbi,
          functionName: "claimablePayouts" as const,
          args: [marketId, participant.bettor] as const
        },
        {
          address: shieldBetConfig.address,
          abi: shieldBetAbi,
          functionName: "hasClaimed" as const,
          args: [marketId, participant.bettor] as const
        }
      ]);

    const winnerState = winnerContracts.length
      ? await publicClient.multicall({
          contracts: winnerContracts,
          allowFailure: false
        })
      : [];

    let winnerIdx = 0;
    const settlementParticipants: ParticipantPlan[] = clearParticipants.map((participant) => {
      let assignedPayoutWei = 0n;
      let hasClaimed = false;

      if (participant.isWinner) {
        assignedPayoutWei = winnerState[winnerIdx] as bigint;
        hasClaimed = Boolean(winnerState[winnerIdx + 1] as unknown);
        winnerIdx += 2;
      }

      const projectedPayoutWei =
        participant.isWinner && totalWinningSideWei > 0n
          ? (participant.amountWei * distributablePoolWei) / totalWinningSideWei
          : 0n;

      return {
        bettor: participant.bettor,
        outcome: participant.outcome,
        amountWei: participant.amountWei.toString(),
        isWinner: participant.isWinner,
        projectedPayoutWei: projectedPayoutWei.toString(),
        assignedPayoutWei: assignedPayoutWei.toString(),
        hasClaimed
      };
    });

    const response = {
      marketId: marketId.toString(),
      resolvedOutcome: winningOutcome,
      totalPoolWei: totalPool.toString(),
      marketPoolBalanceWei: marketPoolBalance.toString(),
      reservedPayoutBalanceWei: reservedPayoutBalance.toString(),
      feeBasisPoints: feeBasisPoints.toString(),
      feeWei: feeWei.toString(),
      distributablePoolWei: distributablePoolWei.toString(),
      totalWinningSideWei: totalWinningSideWei.toString(),
      participants: settlementParticipants
    };

    logInfo("settlement-api", "settlement plan generated", response);
    return NextResponse.json(response);
  } catch (error) {
    logError("settlement-api", "failed to build settlement plan", {
      marketId: marketId.toString(),
      error: error instanceof Error ? error.message : String(error)
    });
    return NextResponse.json({ error: "Unable to generate settlement plan" }, { status: 500 });
  }
}
