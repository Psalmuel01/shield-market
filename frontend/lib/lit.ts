"use client";

import { LitNodeClient } from "@lit-protocol/lit-node-client";
import { LitActionResource, createSiweMessageWithRecaps, generateAuthSig } from "@lit-protocol/auth-helpers";
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

export async function runLitClaimAction(params: LitClaimExecutionParams): Promise<LitClaimExecutionResult> {
  if (!params.walletClient.account?.address) {
    throw new Error("Wallet client is not connected");
  }

  const litNetwork = process.env.NEXT_PUBLIC_LIT_NETWORK || "datil";
  const litClient = new LitNodeClient({
    litNetwork: litNetwork as any,
    debug: false
  });

  await litClient.connect();

  try {
    const walletAddress = params.walletClient.account.address;
    const litResource = new LitActionResource(params.actionCid);

    const signerLike = {
      signMessage: async (message: string) =>
        params.walletClient.signMessage({
          account: params.walletClient.account!,
          message
        })
    };

    const sessionSigs = await litClient.getSessionSigs({
      chain: "ethereum",
      expiration: new Date(Date.now() + 1000 * 60 * 10).toISOString(),
      resourceAbilityRequests: [{ resource: litResource, ability: "lit-action-execution" }],
      authNeededCallback: async (authCallbackParams) => {
        const toSign = await createSiweMessageWithRecaps({
          walletAddress,
          nonce: authCallbackParams.nonce,
          litNodeClient: litClient,
          uri: authCallbackParams.uri || "https://shieldbet.app",
          expiration: authCallbackParams.expiration || new Date(Date.now() + 1000 * 60 * 10).toISOString(),
          resources: authCallbackParams.resourceAbilityRequests || [{ resource: litResource, ability: "lit-action-execution" }]
        });

        return generateAuthSig({
          signer: signerLike as any,
          toSign,
          address: walletAddress
        });
      }
    });

    const execution = await litClient.executeJs({
      ipfsId: params.actionCid,
      sessionSigs,
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
      logs: execution?.logs || ""
    };
  } finally {
    if (typeof litClient.disconnect === "function") {
      await litClient.disconnect();
    }
  }
}
