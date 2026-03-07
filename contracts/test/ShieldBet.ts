import { FhevmType } from "@fhevm/hardhat-plugin";
import { expect } from "chai";
import { ethers } from "hardhat";
import * as hre from "hardhat";

describe("ShieldBet", function () {
  async function deployFixture() {
    const [owner, alice, bob] = await ethers.getSigners();
    const ShieldBet = await ethers.getContractFactory("ShieldBet");
    const shieldBet = await ShieldBet.deploy();
    await shieldBet.waitForDeployment();

    await hre.fhevm.assertCoprocessorInitialized(shieldBet, "ShieldBet");

    return { shieldBet, owner, alice, bob };
  }

  async function encryptBet(
    contractAddress: string,
    bettorAddress: string,
    outcome: number,
    amount: bigint
  ): Promise<{ encOutcome: string; encAmount: string; inputProof: string }> {
    const input = hre.fhevm.createEncryptedInput(contractAddress, bettorAddress);
    input.add8(outcome);
    input.add64(amount);

    const encrypted = await input.encrypt();

    return {
      encOutcome: encrypted.handles[0],
      encAmount: encrypted.handles[1],
      inputProof: encrypted.inputProof
    };
  }

  it("creates markets and anchors metadata CID", async function () {
    const { shieldBet, alice } = await deployFixture();
    const deadline = BigInt((await ethers.provider.getBlock("latest"))!.timestamp + 3600);

    await expect(shieldBet.connect(alice).createMarket("Will ETH be above $5k by Dec 2026?", deadline))
      .to.emit(shieldBet, "MarketCreated")
      .withArgs(1n, "Will ETH be above $5k by Dec 2026?", deadline, alice.address);

    await expect(shieldBet.connect(alice).anchorMarketMetadataCID(1, "bafy-market-cid"))
      .to.emit(shieldBet, "MarketMetadataAnchored")
      .withArgs(1n, "bafy-market-cid");

    expect(await shieldBet.marketMetadataCID(1)).to.equal("bafy-market-cid");
  });

  it("accepts FHE bets and preserves confidential user positions", async function () {
    const { shieldBet, owner, alice, bob } = await deployFixture();
    const shieldBetAddress = await shieldBet.getAddress();
    const deadline = BigInt((await ethers.provider.getBlock("latest"))!.timestamp + 3600);

    await shieldBet.connect(owner).createMarket("Test market", deadline);

    const aliceAmount = 2_000_000_000_000_000_000n;
    const bobAmount = 1_000_000_000_000_000_000n;

    const aliceBet = await encryptBet(shieldBetAddress, alice.address, 1, aliceAmount);
    await shieldBet.connect(alice).placeBet(1, aliceBet.encOutcome, aliceBet.encAmount, aliceBet.inputProof, {
      value: aliceAmount
    });

    const bobBet = await encryptBet(shieldBetAddress, bob.address, 2, bobAmount);
    await shieldBet.connect(bob).placeBet(1, bobBet.encOutcome, bobBet.encAmount, bobBet.inputProof, {
      value: bobAmount
    });

    expect(await shieldBet.hasPosition(1, alice.address)).to.equal(true);
    expect(await shieldBet.hasPosition(1, bob.address)).to.equal(true);

    expect(await ethers.provider.getBalance(shieldBetAddress)).to.equal(aliceAmount + bobAmount);

    const aliceBetHandle = await shieldBet.connect(alice).getMyBet(1);
    const aliceOutcomeHandle = await shieldBet.connect(alice).getMyOutcome(1);

    const clearAliceBet = await hre.fhevm.userDecryptEuint(
      FhevmType.euint64,
      aliceBetHandle,
      shieldBetAddress,
      alice
    );
    const clearAliceOutcome = await hre.fhevm.userDecryptEuint(
      FhevmType.euint8,
      aliceOutcomeHandle,
      shieldBetAddress,
      alice
    );

    expect(clearAliceBet).to.equal(aliceAmount);
    expect(clearAliceOutcome).to.equal(1n);
  });

  it("resolves market and lets assigned winner claim payout", async function () {
    const { shieldBet, owner, alice, bob } = await deployFixture();
    const shieldBetAddress = await shieldBet.getAddress();
    const deadline = BigInt((await ethers.provider.getBlock("latest"))!.timestamp + 3600);

    await shieldBet.connect(owner).createMarket("Who wins?", deadline);

    const aliceAmount = 2_000_000_000_000_000_000n;
    const bobAmount = 1_000_000_000_000_000_000n;

    const aliceBet = await encryptBet(shieldBetAddress, alice.address, 1, aliceAmount);
    await shieldBet.connect(alice).placeBet(1, aliceBet.encOutcome, aliceBet.encAmount, aliceBet.inputProof, {
      value: aliceAmount
    });

    const bobBet = await encryptBet(shieldBetAddress, bob.address, 2, bobAmount);
    await shieldBet.connect(bob).placeBet(1, bobBet.encOutcome, bobBet.encAmount, bobBet.inputProof, {
      value: bobAmount
    });

    await shieldBet.connect(owner).resolveMarket(1, 1);
    await shieldBet.connect(owner).anchorResolutionCID(1, "bafy-resolution-cid");

    const payout = 3_000_000_000_000_000_000n;
    await expect(shieldBet.connect(owner).assignWinnerPayout(1, alice.address, payout))
      .to.emit(shieldBet, "PayoutAssigned")
      .withArgs(1n, alice.address, payout);

    const quote = await shieldBet.getClaimQuote(1, alice.address);
    expect(quote[1]).to.equal(true);
    expect(quote[0]).to.equal(payout);

    await expect(shieldBet.connect(bob).claimWinnings(1)).to.be.revertedWithCustomError(shieldBet, "NoClaimablePayout");

    await expect(() => shieldBet.connect(alice).claimWinnings(1)).to.changeEtherBalances(
      [alice, shieldBet],
      [payout, -payout]
    );

    await expect(shieldBet.connect(alice).claimWinnings(1)).to.be.revertedWithCustomError(shieldBet, "AlreadyClaimed");
  });
});
