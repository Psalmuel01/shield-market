import { Address, bytesToHex, getAddress } from "viem";
import type { WalletClient } from "viem";
import { logInfo } from "@/lib/telemetry";
import { resolveFhevmEnvConfig } from "@/lib/fhevm-config";

export type BetOutcome = 1 | 2;

export interface EncryptedBetPayload {
  encOutcome: `0x${string}`;
  encAmount: `0x${string}`;
  inputProof: `0x${string}`;
}

interface EncryptBetParams {
  contractAddress: Address;
  userAddress: Address;
}

interface UserDecryptParams {
  contractAddress: Address;
  userAddress: Address;
  walletClient: WalletClient;
  handles: (`0x${string}` | null | undefined)[];
}

type FhevmWebModule = typeof import("@zama-fhe/relayer-sdk/web");
type FhevmInstance = Awaited<ReturnType<FhevmWebModule["createInstance"]>>;

const MAX_UINT64 = (1n << 64n) - 1n;
let fhevmInstancePromise: Promise<FhevmInstance> | null = null;
let fhevmSdkInitPromise: Promise<void> | null = null;

async function getFhevmInstance(): Promise<FhevmInstance> {
  if (fhevmInstancePromise) return fhevmInstancePromise;

  fhevmInstancePromise = (async () => {
    const sdk = await import("@zama-fhe/relayer-sdk/web");
    if (!fhevmSdkInitPromise) {
      fhevmSdkInitPromise = (async () => {
        logInfo("encryption", "initializing FHEVM SDK wasm modules");
        await sdk.initSDK();
        logInfo("encryption", "FHEVM SDK wasm modules ready");
      })().catch((error) => {
        fhevmSdkInitPromise = null;
        throw error;
      });
    }
    await fhevmSdkInitPromise;

    const config = resolveFhevmEnvConfig();

    if (config.relayerUrl && config.gatewayChainId && config.aclContractAddress && config.kmsContractAddress) {
      const customConfig = {
        chainId: config.chainId,
        network: config.network,
        relayerUrl: config.relayerUrl,
        gatewayChainId: config.gatewayChainId,
        aclContractAddress: config.aclContractAddress,
        kmsContractAddress: config.kmsContractAddress,
        inputVerifierContractAddress: config.inputVerifierContractAddress!,
        verifyingContractAddressDecryption: config.verifyingContractAddressDecryption!,
        verifyingContractAddressInputVerification: config.verifyingContractAddressInputVerification!
      };
      logInfo("encryption", "using custom FHEVM config", {
        chainId: config.chainId,
        relayerUrl: config.relayerUrl
      });
      return sdk.createInstance(customConfig);
    }

    if (config.chainId === 11155111) {
      logInfo("encryption", "using Sepolia FHEVM defaults", { chainId: config.chainId, network: config.network });
      return sdk.createInstance({
        ...sdk.SepoliaConfig,
        network: config.network
      });
    }

    if (config.chainId === 1) {
      logInfo("encryption", "using Mainnet FHEVM defaults", { chainId: config.chainId, network: config.network });
      return sdk.createInstance({
        ...sdk.MainnetConfig,
        network: config.network
      });
    }

    throw new Error(
      "Unsupported chain for default FHEVM config. Set NEXT_PUBLIC_FHEVM_* env vars for custom relayer setup."
    );
  })().catch((error) => {
    fhevmInstancePromise = null;
    throw error;
  });

  return fhevmInstancePromise;
}

export async function encryptBetInputs(
  outcome: BetOutcome,
  amountWei: bigint,
  params: EncryptBetParams
): Promise<EncryptedBetPayload> {
  if (amountWei <= 0n) {
    throw new Error("Bet amount must be positive");
  }

  if (amountWei > MAX_UINT64) {
    throw new Error("Bet amount exceeds euint64 limit");
  }

  const instance = await getFhevmInstance();
  const encryptedInput = instance.createEncryptedInput(getAddress(params.contractAddress), getAddress(params.userAddress));

  encryptedInput.add8(outcome);
  encryptedInput.add64(amountWei);

  const encrypted = await encryptedInput.encrypt();

  return {
    encOutcome: bytesToHex(encrypted.handles[0]) as `0x${string}`,
    encAmount: bytesToHex(encrypted.handles[1]) as `0x${string}`,
    inputProof: bytesToHex(encrypted.inputProof) as `0x${string}`
  };
}

export async function decryptUserHandles({
  contractAddress,
  userAddress,
  walletClient,
  handles
}: UserDecryptParams): Promise<Record<`0x${string}`, bigint | number | boolean | string>> {
  const sanitizedHandles = handles.filter(Boolean) as `0x${string}`[];
  if (!sanitizedHandles.length) return {};

  const instance = await getFhevmInstance();
  const keypair = instance.generateKeypair();
  const startTimestamp = Math.floor(Date.now() / 1000);
  const durationDays = 1;
  const eip712 = instance.createEIP712(keypair.publicKey, [getAddress(contractAddress)], startTimestamp, durationDays);

  const signature = await (walletClient.signTypedData as (...args: any[]) => Promise<`0x${string}`>)({
    domain: eip712.domain,
    types: {
      UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification
    },
    primaryType: "UserDecryptRequestVerification",
    message: eip712.message,
    account: walletClient.account || getAddress(userAddress)
  });

  const result = await instance.userDecrypt(
    sanitizedHandles.map((handle) => ({
      handle,
      contractAddress: getAddress(contractAddress)
    })),
    keypair.privateKey,
    keypair.publicKey,
    signature,
    [getAddress(contractAddress)],
    getAddress(userAddress),
    startTimestamp,
    durationDays
  );

  return result as Record<`0x${string}`, bigint | number | boolean | string>;
}
