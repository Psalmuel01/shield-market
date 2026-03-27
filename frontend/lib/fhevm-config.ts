import { getAddress } from "viem";

export interface ResolvedFhevmConfig {
  chainId: number;
  network: string;
  relayerUrl?: string;
  gatewayChainId?: number;
  aclContractAddress?: `0x${string}`;
  kmsContractAddress?: `0x${string}`;
  inputVerifierContractAddress?: `0x${string}`;
  verifyingContractAddressDecryption?: `0x${string}`;
  verifyingContractAddressInputVerification?: `0x${string}`;
}

export function resolveFhevmEnvConfig(): ResolvedFhevmConfig {
  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 11155111);
  const network = process.env.NEXT_PUBLIC_CHAIN_RPC_URL;

  if (!network) {
    throw new Error("Missing NEXT_PUBLIC_CHAIN_RPC_URL for FHEVM relayer encryption");
  }

  const useCustom = process.env.NEXT_PUBLIC_FHEVM_USE_CUSTOM === "true";
  if (!useCustom) {
    return { chainId, network };
  }

  const acl = process.env.NEXT_PUBLIC_FHEVM_ACL_CONTRACT;
  const kms = process.env.NEXT_PUBLIC_FHEVM_KMS_CONTRACT;
  const inputVerifier = process.env.NEXT_PUBLIC_FHEVM_INPUT_VERIFIER_CONTRACT;
  const verifyDecrypt = process.env.NEXT_PUBLIC_FHEVM_VERIFY_DECRYPTION_CONTRACT;
  const verifyInput = process.env.NEXT_PUBLIC_FHEVM_VERIFY_INPUT_CONTRACT;
  const gatewayChainId = process.env.NEXT_PUBLIC_FHEVM_GATEWAY_CHAIN_ID;
  const relayerUrl = process.env.NEXT_PUBLIC_FHEVM_RELAYER_URL;

  const hasAllCustomVars =
    acl && kms && inputVerifier && verifyDecrypt && verifyInput && gatewayChainId && relayerUrl;

  if (!hasAllCustomVars) {
    return { chainId, network };
  }

  return {
    chainId,
    network,
    aclContractAddress: getAddress(acl) as `0x${string}`,
    kmsContractAddress: getAddress(kms) as `0x${string}`,
    inputVerifierContractAddress: getAddress(inputVerifier) as `0x${string}`,
    verifyingContractAddressDecryption: getAddress(verifyDecrypt) as `0x${string}`,
    verifyingContractAddressInputVerification: getAddress(verifyInput) as `0x${string}`,
    gatewayChainId: Number(gatewayChainId),
    relayerUrl
  };
}
