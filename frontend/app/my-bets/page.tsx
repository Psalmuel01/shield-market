"use client";

import { useEffect, useMemo, useState } from "react";
import { Trophy, Wallet } from "lucide-react";
import { getAddress } from "viem";
import { useAccount, useReadContract, useReadContracts, useWalletClient } from "wagmi";
import { MyBetRow, MyBetsTable } from "@/components/my-bets-table";
import { shieldBetConfig } from "@/lib/contract";
import { decryptUserHandles } from "@/lib/encryption";
import { decodeMarketView } from "@/lib/market-contract";
import { logWarn } from "@/lib/telemetry";

export default function MyBetsPage() {
  const { address } = useAccount();
  const normalizedAddress = address ? getAddress(address) : null;
  const { data: walletClient } = useWalletClient();
  const [decryptedPositions, setDecryptedPositions] = useState<Record<string, number>>({});

  const { data: marketCount } = useReadContract({
    ...shieldBetConfig,
    functionName: "marketCount"
  });

  const ids = useMemo(() => {
    if (!marketCount) return [] as bigint[];
    const count = Number(marketCount);
    return Array.from({ length: count }, (_, idx) => BigInt(idx + 1));
  }, [marketCount]);

  const contracts = useMemo(() => {
    if (!address) return [];

    return ids.flatMap((marketId) => [
      { ...shieldBetConfig, functionName: "markets" as const, args: [marketId] as const },
      { ...shieldBetConfig, functionName: "hasPosition" as const, args: [marketId, address] as const },
      { ...shieldBetConfig, functionName: "claimablePayouts" as const, args: [marketId, address] as const },
      { ...shieldBetConfig, functionName: "getMyOutcome" as const, args: [marketId] as const, account: address },
      { ...shieldBetConfig, functionName: "stakeAmounts" as const, args: [marketId, address] as const },
      { ...shieldBetConfig, functionName: "hasClaimed" as const, args: [marketId, address] as const },
      { ...shieldBetConfig, functionName: "getOutcomeLabels" as const, args: [marketId] as const }
    ]);
  }, [address, ids]);

  const { data: batch } = useReadContracts({
    contracts,
    query: { enabled: Boolean(address && contracts.length) }
  });

  useEffect(() => {
    if (!normalizedAddress || !walletClient || !batch?.length) return;

    const userAddress = normalizedAddress;
    const signer = walletClient;
    const batchResults = batch;
    let cancelled = false;

    async function loadPositions() {
      const handles: { marketId: bigint; handle: `0x${string}` }[] = [];

      for (let i = 0; i < batchResults.length; i += 7) {
        const hasPositionRes = batchResults[i + 1];
        const outcomeRes = batchResults[i + 3];
        const marketId = ids[i / 7];

        if (hasPositionRes?.status !== "success" || !hasPositionRes.result) continue;
        if (outcomeRes?.status !== "success" || !outcomeRes.result) continue;

        handles.push({ marketId, handle: outcomeRes.result as `0x${string}` });
      }

      if (!handles.length) return;

      try {
        const decrypted = await decryptUserHandles({
          contractAddress: shieldBetConfig.address,
          userAddress,
          walletClient: signer,
          handles: handles.map((entry) => entry.handle)
        });

        if (cancelled) return;

        const next: Record<string, number> = {};
        for (const entry of handles) {
          next[entry.marketId.toString()] = Number(decrypted[entry.handle]);
        }
        setDecryptedPositions(next);
      } catch (error) {
        logWarn("my-bets", "failed to decrypt positions", error);
      }
    }

    void loadPositions();
    return () => {
      cancelled = true;
    };
  }, [batch, ids, normalizedAddress, walletClient]);

  const rows = useMemo(() => {
    if (!batch?.length || !address) return [] as MyBetRow[];

    const next: MyBetRow[] = [];
    for (let i = 0; i < batch.length; i += 7) {
      const marketRes = batch[i];
      const hasPositionRes = batch[i + 1];
      const claimablePayoutRes = batch[i + 2];
      const stakeRes = batch[i + 4];
      const hasClaimedRes = batch[i + 5];
      const labelsRes = batch[i + 6];
      const marketId = ids[i / 7];

      if (
        marketRes?.status !== "success" ||
        !marketRes.result ||
        hasPositionRes?.status !== "success" ||
        !hasPositionRes.result
      ) {
        continue;
      }

      const market = decodeMarketView(marketRes.result);
      if (!market) continue;

      const labels = (labelsRes?.status === "success" ? (labelsRes.result as string[]) : []) || ["YES", "NO"];
      const decryptedIdx = decryptedPositions[marketId.toString()];
      const position = decryptedIdx !== undefined ? labels[decryptedIdx] : "Encrypted";

      const stakeWei = BigInt(((stakeRes?.status === "success" ? stakeRes.result : 0n) as bigint) || 0n);
      const claimablePayoutWei = BigInt(((claimablePayoutRes?.status === "success" ? claimablePayoutRes.result : 0n) as bigint) || 0n);
      const isClaimable = claimablePayoutWei > 0n;
      const hasClaimed = hasClaimedRes?.status === "success" ? Boolean(hasClaimedRes.result) : false;

      let status: MyBetRow["status"] = "Open";
      if (market.status === 1) status = "Awaiting Resolution";
      else if (market.status === 2) status = "Proposed";
      else if (market.status === 3) status = "Disputed";
      else if (market.status === 4) {
        if (hasClaimed) status = "Claimed";
        else if (isClaimable) status = "Won";
        else if (decryptedIdx !== undefined) status = decryptedIdx === market.outcome ? "Awaiting Payout" : "Lost";
        else status = "Finalized";
      }

      next.push({
        marketId,
        question: market.question,
        position,
        amountWei: stakeWei.toString(),
        status,
        canClaim: isClaimable && !hasClaimed,
        claimType: "winnings"
      });
    }

    return next;
  }, [address, batch, decryptedPositions, ids]);

  const stats = useMemo(() => {
    const total = rows.length;
    const open = rows.filter((row) => row.status === "Open" || row.status === "Awaiting Resolution").length;
    const won = rows.filter((row) => row.status === "Won" || row.status === "Claimed").length;
    return [
      { label: "Total positions", value: total.toString() },
      { label: "Still active", value: open.toString() },
      { label: "Winning records", value: won.toString() }
    ];
  }, [rows]);

  return (
    <section className="vm-page page-enter">
      <div className="vm-page-header">
        <div>
          <div className="vm-page-header__meta">
            <span className="vm-page-eyebrow">
              <Trophy className="h-3.5 w-3.5" />
              Portfolio Dashboard
            </span>
          </div>
          <h1 className="vm-page-title mt-5">
            My <span className="vm-text-gradient">Positions</span>
          </h1>
          <p className="vm-page-subtitle mt-4">
            Track your confidential market exposure, recovered outcome selections, claimable positions, and completed settlements in one place.
          </p>
        </div>

        <div className="vm-card w-full max-w-sm p-6">
          <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--primary)]">
            <Wallet className="h-4 w-4" />
            Portfolio Summary
          </div>
          <div className="mt-5 grid gap-3">
            {stats.map((item) => (
              <div key={item.label} className="flex items-center justify-between rounded-2xl border border-white/6 bg-white/[0.03] px-4 py-3">
                <span className="text-sm text-[var(--text-muted)]">{item.label}</span>
                <span className="font-mono text-lg font-bold text-white">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {!address ? (
        <div className="vm-card p-16 text-center">
          <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full border border-white/6 bg-white/[0.03] text-2xl">
            🔐
          </div>
          <h2 className="font-display mt-6 text-2xl font-bold text-white">Connect your wallet</h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-white/55">
            Your portfolio is tied to the wallet that placed each market position. Connect it to recover your confidential side selections locally.
          </p>
        </div>
      ) : (
        <MyBetsTable rows={rows} />
      )}
    </section>
  );
}
