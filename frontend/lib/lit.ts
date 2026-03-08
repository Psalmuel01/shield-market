"use client";

import { createAuthManager } from "@lit-protocol/auth/src/lib/AuthManager/auth-manager";
import { localStorage } from "@lit-protocol/auth/src/lib/storage/localStorage";
import { createLitClient } from "@lit-protocol/lit-client";
import { naga, nagaDev, nagaLocal, nagaMainnet, nagaProto, nagaStaging, nagaTest } from "@lit-protocol/networks";
import type { WalletClient } from "viem";

export interface LitClaimExecutionParams {
  actionCid: string;
  marketId: string;
  account: `0x${string}`;
  expectedPayoutWei: string;
  txHash?: string;
  walletClient: WalletClient;
}

export interface LitClaimExecutionResult {
  actionCid: string;
  response: unknown;
  logs: string;
}

type LitNetworkName =
  | "naga"
  | "naga-mainnet"
  | "naga-test"
  | "naga-dev"
  | "naga-local"
  | "naga-staging"
  | "naga-proto"
  | "datil";

const DEFAULT_LIT_NETWORK: LitNetworkName = "naga-test";

function resolveLitNetworkConfig() {
  const requested = (process.env.NEXT_PUBLIC_LIT_NETWORK || DEFAULT_LIT_NETWORK).toLowerCase() as LitNetworkName;

  switch (requested) {
    case "naga":
      return { network: naga, name: "naga" };
    case "naga-mainnet":
      return { network: nagaMainnet, name: "naga-mainnet" };
    case "naga-dev":
      return { network: nagaDev, name: "naga-dev" };
    case "naga-local":
      return { network: nagaLocal, name: "naga-local" };
    case "naga-staging":
      return { network: nagaStaging, name: "naga-staging" };
    case "naga-proto":
      return { network: nagaProto, name: "naga-proto" };
    case "datil":
      // Backward-compatible alias used in older env files.
      return { network: nagaTest, name: "naga-test" };
    case "naga-test":
    default:
      return { network: nagaTest, name: "naga-test" };
  }
}

function normalizeLitLogs(logs: unknown): string {
  if (typeof logs === "string") return logs;
  if (Array.isArray(logs)) {
    return logs
      .map((entry) => {
        if (typeof entry === "string") return entry;
        try {
          return JSON.stringify(entry);
        } catch {
          return String(entry);
        }
      })
      .join("\n");
  }
  if (logs == null) return "";
  try {
    return JSON.stringify(logs);
  } catch {
    return String(logs);
  }
}

export async function runLitClaimAction(params: LitClaimExecutionParams): Promise<LitClaimExecutionResult> {
  if (!params.walletClient.account?.address) {
    throw new Error("Wallet client is not connected");
  }

  const networkConfig = resolveLitNetworkConfig();
  const litClient = await createLitClient({
    network: networkConfig.network
  });

  try {
    const authManager = createAuthManager({
      storage: localStorage({
        appName: "shieldbet",
        networkName: networkConfig.name
      })
    });

    const authContext = await authManager.createEoaAuthContext({
      litClient,
      config: {
        account: params.walletClient
      },
      authConfig: {
        domain: typeof window !== "undefined" ? window.location.host : "shieldbet.app",
        statement: "Authorize ShieldBet confidential claim verification.",
      expiration: new Date(Date.now() + 1000 * 60 * 10).toISOString(),
        resources: [
          {
            ability: "lit-action-execution",
            resource: params.actionCid
          }
        ]
      }
    });

    const execution = await litClient.executeJs({
      ipfsId: params.actionCid,
      authContext,
      jsParams: {
        marketId: params.marketId,
        account: params.account,
        expectedPayoutWei: params.expectedPayoutWei,
        txHash: params.txHash || ""
      }
    });

    return {
      actionCid: params.actionCid,
      response: execution?.response ?? null,
      logs: normalizeLitLogs(execution?.logs)
    };
  } finally {
    litClient.disconnect();
  }
}
