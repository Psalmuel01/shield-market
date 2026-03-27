import { resolveFhevmEnvConfig } from "@/lib/fhevm-config";

type FhevmNodeModule = typeof import("@zama-fhe/relayer-sdk/node");
type FhevmNodeInstance = Awaited<ReturnType<FhevmNodeModule["createInstance"]>>;

let fhevmServerInstancePromise: Promise<FhevmNodeInstance> | null = null;

async function getFhevmServerInstance() {
  if (fhevmServerInstancePromise) return fhevmServerInstancePromise;

  fhevmServerInstancePromise = (async () => {
    const sdk = (await import("@zama-fhe/relayer-sdk/node")) as FhevmNodeModule;
    const config = resolveFhevmEnvConfig();

    if (config.relayerUrl && config.gatewayChainId && config.aclContractAddress && config.kmsContractAddress) {
      return sdk.createInstance({
        chainId: config.chainId,
        network: config.network,
        relayerUrl: config.relayerUrl,
        gatewayChainId: config.gatewayChainId,
        aclContractAddress: config.aclContractAddress,
        kmsContractAddress: config.kmsContractAddress,
        inputVerifierContractAddress: config.inputVerifierContractAddress!,
        verifyingContractAddressDecryption: config.verifyingContractAddressDecryption!,
        verifyingContractAddressInputVerification: config.verifyingContractAddressInputVerification!
      });
    }

    if (config.chainId === 11155111) {
      return sdk.createInstance({
        ...sdk.SepoliaConfig,
        network: config.network
      });
    }

    if (config.chainId === 1) {
      return sdk.createInstance({
        ...sdk.MainnetConfig,
        network: config.network
      });
    }

    throw new Error("Unsupported chain for server-side FHEVM operations.");
  })().catch((error) => {
    fhevmServerInstancePromise = null;
    throw error;
  });

  return fhevmServerInstancePromise;
}

export async function publicDecryptHandles(handles: `0x${string}`[]) {
  if (!handles.length) return {} as Record<`0x${string}`, bigint | number | boolean | string>;
  const instance = await getFhevmServerInstance();
  const result = await instance.publicDecrypt(handles);
  return result as Record<`0x${string}`, bigint | number | boolean | string>;
}
