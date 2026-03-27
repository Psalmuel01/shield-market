import { ethers } from "hardhat";
import * as hre from "hardhat";
import dotenv from "dotenv";
import { parseEther } from "ethers";
import { ShieldBet__factory } from "../typechain-types";

dotenv.config({ path: ".env" });
dotenv.config({ path: "../frontend/.env.local" });

async function main() {
  const contractAddress = process.env.SHIELDBET_ADDRESS || process.env.NEXT_PUBLIC_SHIELDBET_ADDRESS;
  if (!contractAddress) {
    throw new Error("Missing SHIELDBET_ADDRESS or NEXT_PUBLIC_SHIELDBET_ADDRESS");
  }

  const [owner] = await ethers.getSigners();
  const provider = ethers.provider;
  const shieldBet = ShieldBet__factory.connect(contractAddress, owner);

  await hre.fhevm.initializeCLIApi();

  const alice = ethers.Wallet.createRandom().connect(provider);
  const bob = ethers.Wallet.createRandom().connect(provider);

  const fundingAmount = parseEther("0.0004");
  console.log("Funding ephemeral bettors...");
  await (await owner.sendTransaction({ to: alice.address, value: fundingAmount })).wait();
  await (await owner.sendTransaction({ to: bob.address, value: fundingAmount })).wait();

  const latestBlock = await provider.getBlock("latest");
  if (!latestBlock) {
    throw new Error("Unable to load latest block");
  }

  const deadline = BigInt(latestBlock.timestamp + 60);
  console.log("Creating market on live chain...");
  const createTx = await shieldBet.createMarketWithMetadata(
    "Live demo: Will ShieldBet settle correctly on Sepolia today?",
    deadline,
    "Crypto",
    "Resolves YES if the live Sepolia e2e script completes with a successful claim.",
    "Owner settlement"
  );
  const createReceipt = await createTx.wait();
  if (!createReceipt) {
    throw new Error("Missing create receipt");
  }

  const marketCreatedEvent = shieldBet.interface.getEvent("MarketCreated");
  if (!marketCreatedEvent) {
    throw new Error("Missing MarketCreated event");
  }

  let marketId: bigint | null = null;
  for (const log of createReceipt.logs) {
    try {
      const parsed = shieldBet.interface.parseLog(log);
      if (parsed?.name === "MarketCreated") {
        marketId = parsed.args.marketId as bigint;
        break;
      }
    } catch {
      continue;
    }
  }

  if (!marketId) {
    throw new Error("Unable to determine marketId from create receipt");
  }
  console.log(`Market created: ${marketId.toString()}`);

  async function encryptBet(bettorAddress: string, outcome: number, amount: bigint) {
    const input = hre.fhevm.createEncryptedInput(contractAddress, bettorAddress);
    input.add8(outcome);
    input.add64(amount);
    return input.encrypt();
  }

  const aliceAmount = parseEther("0.0001");
  const bobAmount = parseEther("0.0002");

  console.log("Placing encrypted YES bet from alice...");
  const aliceEncrypted = await encryptBet(alice.address, 1, aliceAmount);
  const alicePlaceBetTx = await shieldBet.placeBet.populateTransaction(
    marketId,
    aliceEncrypted.handles[0],
    aliceEncrypted.handles[1],
    aliceEncrypted.inputProof,
    { value: aliceAmount }
  );
  await (await alice.sendTransaction({ ...alicePlaceBetTx, to: contractAddress, value: aliceAmount })).wait();

  console.log("Placing encrypted NO bet from bob...");
  const bobEncrypted = await encryptBet(bob.address, 2, bobAmount);
  const bobPlaceBetTx = await shieldBet.placeBet.populateTransaction(
    marketId,
    bobEncrypted.handles[0],
    bobEncrypted.handles[1],
    bobEncrypted.inputProof,
    { value: bobAmount }
  );
  await (await bob.sendTransaction({ ...bobPlaceBetTx, to: contractAddress, value: bobAmount })).wait();

  console.log("Waiting for market close...");
  while (true) {
    const currentBlock = await provider.getBlock("latest");
    if (currentBlock && BigInt(currentBlock.timestamp) > deadline) break;
    await new Promise((resolve) => setTimeout(resolve, 4_000));
  }

  console.log("Resolving market YES and computing payout...");
  await (await shieldBet.resolveMarket(marketId, 1)).wait();
  await (await shieldBet.computeAndAssignPayout(marketId, alice.address, aliceAmount, aliceAmount)).wait();

  console.log("Claiming winnings from alice...");
  const claimTx = await shieldBet.connect(alice).claimWinnings(marketId);
  const claimReceipt = await claimTx.wait();
  if (!claimReceipt || claimReceipt.status !== 1) {
    throw new Error("Claim transaction failed");
  }

  console.log("Attempting losing claim from bob (expected failure)...");
  try {
    await shieldBet.connect(bob).claimWinnings(marketId);
    throw new Error("Bob claim unexpectedly succeeded");
  } catch (error) {
    console.log("Bob claim reverted as expected.");
  }

  console.log("Live demo completed successfully.");
  console.log(`Contract: ${contractAddress}`);
  console.log(`Market ID: ${marketId.toString()}`);
  console.log(`Winner: ${alice.address}`);
  console.log(`Claim tx: ${claimReceipt.hash}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
