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

  const latestBlock = await provider.getBlock("latest");
  if (!latestBlock) {
    throw new Error("Unable to load latest block");
  }

  // Set deadline 30s ahead
  const deadline = BigInt(latestBlock.timestamp + 30);
  console.log("Creating categorical market (Binary type)...");
  
  const createTx = await shieldBet.createMarketWithMetadata(
    "Optimistic Oracle: Will fhEVM settle this correctly?",
    deadline,
    0, // MarketType.Binary
    ["YES", "NO"],
    "Demo",
    "Resolves YES if the e2e flow completes.",
    "Owner proposal"
  );
  const createReceipt = await createTx.wait();
  if (!createReceipt) throw new Error("Missing create receipt");

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

  if (!marketId) throw new Error("Unable to determine marketId");
  console.log(`Market created: ${marketId.toString()}`);

  async function encryptBetSide(bettorAddress: string, outcome: number) {
    const input = hre.fhevm.createEncryptedInput(contractAddress!, bettorAddress);
    input.add8(outcome);
    return input.encrypt();
  }

  const stake = parseEther("0.001");
  console.log("Placing encrypted YES bet...");
  const enc = await encryptBetSide(owner.address, 0); // YES is index 0
  await (await shieldBet.placeBet(marketId, enc.handles[0], enc.inputProof, { value: stake })).wait();
  
  console.log("Waiting for market close...");
  while (true) {
    const current = await provider.getBlock("latest");
    if (current && BigInt(current.timestamp) > deadline) break;
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log("Proposing outcome index 0 (YES)...");
  const oracleStake = await shieldBet.ORACLE_STAKE();
  await (await shieldBet.proposeOutcome(marketId, 0, { value: oracleStake })).wait();

  const market = await shieldBet.markets(marketId);
  const disputeEnd = market.disputeWindowEnd;
  console.log(`Waiting for dispute window at ${new Date(Number(disputeEnd) * 1000).toLocaleString()}`);

  while (true) {
    const current = await provider.getBlock("latest");
    if (current && BigInt(current.timestamp) > disputeEnd) break;
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, 5000));
  }
  process.stdout.write("\n");

  console.log("Finalizing outcome...");
  await (await shieldBet.finalizeOutcome(marketId, 0)).wait();

  console.log("Opening settlement data...");
  await (await shieldBet.openSettlementData(marketId, [owner.address])).wait();

  console.log("Assigning manual payout...");
  await (await shieldBet.assignPayoutManual(marketId, owner.address, stake)).wait();

  console.log("Claiming winnings...");
  const claimTx = await shieldBet.claimWinnings(marketId);
  const claimReceipt = await claimTx.wait();
  if (!claimReceipt || claimReceipt.status !== 1) throw new Error("Claim failed");

  console.log("E2E demo completed successfully!");
  console.log(`Final output: https://explorer.zama.ai/address/${contractAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
