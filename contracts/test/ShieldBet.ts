import { FhevmType } from "@fhevm/hardhat-plugin";
import { expect } from "chai";
import { ethers } from "hardhat";
import * as hre from "hardhat";

describe("ShieldBet", function () {
  async function deployFixture() {
    const [owner, alice, bob, carol] = await ethers.getSigners();
    const ShieldBet = await ethers.getContractFactory("ShieldBet");
    const shieldBet = await ShieldBet.deploy();
    await shieldBet.waitForDeployment();

    await hre.fhevm.assertCoprocessorInitialized(shieldBet, "ShieldBet");

    return { shieldBet, owner, alice, bob, carol };
  }

  async function encryptOutcome(contractAddress: string, bettorAddress: string, outcome: number) {
    const input = hre.fhevm.createEncryptedInput(contractAddress, bettorAddress);
    input.add8(outcome);
    const encrypted = await input.encrypt();

    return {
      encOutcome: encrypted.handles[0],
      inputProof: encrypted.inputProof
    };
  }

  async function advancePastDeadline(deadline: bigint, secondsAfter = 1n) {
    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(deadline + secondsAfter)]);
    await ethers.provider.send("evm_mine", []);
  }

  it("creates markets and anchors metadata CID", async function () {
    const { shieldBet, alice } = await deployFixture();
    const deadline = BigInt((await ethers.provider.getBlock("latest"))!.timestamp + 3600);

    await expect(
      shieldBet
        .connect(alice)
        .createMarketWithMetadata(
          "Will ETH be above $5k by Dec 2026?",
          deadline,
          "Crypto",
          "Resolves YES if ETH spot price is above $5000 at close.",
          "Owner settlement"
        )
    )
      .to.emit(shieldBet, "MarketCreated")
      .withArgs(1n, "Will ETH be above $5k by Dec 2026?", deadline, alice.address);

    await expect(shieldBet.connect(alice).anchorMarketMetadataCID(1, "bafy-market-cid"))
      .to.emit(shieldBet, "MarketMetadataAnchored")
      .withArgs(1n, "bafy-market-cid");

    const details = await shieldBet.getMarketDetails(1);
    expect(details[0]).to.equal("Crypto");
    expect(details[1]).to.equal("Resolves YES if ETH spot price is above $5000 at close.");
    expect(details[2]).to.equal("Owner settlement");
    expect(await shieldBet.marketMetadataCID(1)).to.equal("bafy-market-cid");
  });

  it("uses public ETH stake as the source of truth while keeping the side encrypted", async function () {
    const { shieldBet, owner, alice, bob } = await deployFixture();
    const shieldBetAddress = await shieldBet.getAddress();
    const deadline = BigInt((await ethers.provider.getBlock("latest"))!.timestamp + 3600);

    await shieldBet.connect(owner).createMarket("Test market", deadline);

    const aliceStake = 2_000_000_000_000_000_000n;
    const bobStake = 1_000_000_000_000_000_000n;

    const aliceBet = await encryptOutcome(shieldBetAddress, alice.address, 1);
    await shieldBet.connect(alice).placeBet(1, aliceBet.encOutcome, aliceBet.inputProof, {
      value: aliceStake
    });

    const bobBet = await encryptOutcome(shieldBetAddress, bob.address, 2);
    await shieldBet.connect(bob).placeBet(1, bobBet.encOutcome, bobBet.inputProof, {
      value: bobStake
    });

    expect(await shieldBet.hasPosition(1, alice.address)).to.equal(true);
    expect(await shieldBet.hasPosition(1, bob.address)).to.equal(true);
    expect(await shieldBet.stakeAmounts(1, alice.address)).to.equal(aliceStake);
    expect(await shieldBet.stakeAmounts(1, bob.address)).to.equal(bobStake);
    expect(await shieldBet.marketPoolBalance(1)).to.equal(aliceStake + bobStake);
    expect(await ethers.provider.getBalance(shieldBetAddress)).to.equal(aliceStake + bobStake);

    const aliceOutcomeHandle = await shieldBet.connect(alice).getMyOutcome(1);
    const clearAliceOutcome = await hre.fhevm.userDecryptEuint(
      FhevmType.euint8,
      aliceOutcomeHandle,
      shieldBetAddress,
      alice
    );

    expect(clearAliceOutcome).to.equal(1n);
  });

  it("locks the fee at resolution and computes payouts from public stake amounts", async function () {
    const { shieldBet, owner, alice, bob } = await deployFixture();
    const shieldBetAddress = await shieldBet.getAddress();
    const deadline = BigInt((await ethers.provider.getBlock("latest"))!.timestamp + 3600);

    await shieldBet.connect(owner).createMarket("Pro-rata test", deadline);
    await shieldBet.connect(owner).setMarketFeeBasisPoints(1, 200);

    const aliceStake = 2_000_000_000_000_000_000n;
    const bobStake = 3_000_000_000_000_000_000n;

    const aliceBet = await encryptOutcome(shieldBetAddress, alice.address, 1);
    await shieldBet.connect(alice).placeBet(1, aliceBet.encOutcome, aliceBet.inputProof, {
      value: aliceStake
    });

    const bobBet = await encryptOutcome(shieldBetAddress, bob.address, 2);
    await shieldBet.connect(bob).placeBet(1, bobBet.encOutcome, bobBet.inputProof, {
      value: bobStake
    });

    await advancePastDeadline(deadline);
    await expect(shieldBet.connect(owner).resolveMarket(1, 1)).to.emit(shieldBet, "MarketResolved").withArgs(1n, 1);

    const pool = aliceStake + bobStake;
    const fee = (pool * 200n) / 10_000n;
    const expectedPayout = pool - fee;

    expect(await shieldBet.marketFeeAmount(1)).to.equal(fee);
    expect(await shieldBet.accruedFees()).to.equal(fee);

    await expect(shieldBet.connect(owner).computeAndAssignPayout(1, alice.address, aliceStake, aliceStake))
      .to.emit(shieldBet, "PayoutAssigned")
      .withArgs(1n, alice.address, expectedPayout);

    const quote = await shieldBet.getClaimQuote(1, alice.address);
    expect(quote[0]).to.equal(expectedPayout);
    expect(quote[1]).to.equal(true);

    await expect(shieldBet.connect(owner).computeAndAssignPayout(1, alice.address, aliceStake + 1n, aliceStake)).to.be
      .revertedWithCustomError(shieldBet, "InvalidWinningTotals");
  });

  it("lets any caller open settlement data after resolution", async function () {
    const { shieldBet, owner, alice, bob, carol } = await deployFixture();
    const shieldBetAddress = await shieldBet.getAddress();
    const deadline = BigInt((await ethers.provider.getBlock("latest"))!.timestamp + 3600);

    await shieldBet.connect(owner).createMarket("Settlement open test", deadline);

    const aliceBet = await encryptOutcome(shieldBetAddress, alice.address, 1);
    await shieldBet.connect(alice).placeBet(1, aliceBet.encOutcome, aliceBet.inputProof, {
      value: 1_000_000_000_000_000_000n
    });

    const bobBet = await encryptOutcome(shieldBetAddress, bob.address, 2);
    await shieldBet.connect(bob).placeBet(1, bobBet.encOutcome, bobBet.inputProof, {
      value: 2_000_000_000_000_000_000n
    });

    await advancePastDeadline(deadline);
    await shieldBet.connect(owner).resolveMarket(1, 1);

    await expect(shieldBet.connect(carol).openSettlementData(1, [alice.address, bob.address]))
      .to.emit(shieldBet, "MarketTotalsOpened")
      .withArgs(1n);

    expect(await shieldBet.settlementDataOpened(1, alice.address)).to.equal(true);
    expect(await shieldBet.settlementDataOpened(1, bob.address)).to.equal(true);
  });

  it("supports batch payout assignment and fee withdrawal", async function () {
    const { shieldBet, owner, alice, bob } = await deployFixture();
    const shieldBetAddress = await shieldBet.getAddress();
    const deadline = BigInt((await ethers.provider.getBlock("latest"))!.timestamp + 3600);

    await shieldBet.connect(owner).createMarket("Batch payout test", deadline);
    await shieldBet.connect(owner).setMarketFeeBasisPoints(1, 100);

    const aliceStake = 1_000_000_000_000_000_000n;
    const bobStake = 2_000_000_000_000_000_000n;

    const aliceBet = await encryptOutcome(shieldBetAddress, alice.address, 1);
    await shieldBet.connect(alice).placeBet(1, aliceBet.encOutcome, aliceBet.inputProof, {
      value: aliceStake
    });

    const bobBet = await encryptOutcome(shieldBetAddress, bob.address, 1);
    await shieldBet.connect(bob).placeBet(1, bobBet.encOutcome, bobBet.inputProof, {
      value: bobStake
    });

    await advancePastDeadline(deadline);
    await shieldBet.connect(owner).resolveMarket(1, 1);

    const totalWinningSide = aliceStake + bobStake;
    await shieldBet
      .connect(owner)
      .computeAndAssignPayouts(1, [alice.address, bob.address], [aliceStake, bobStake], totalWinningSide);

    const pool = aliceStake + bobStake;
    const fee = (pool * 100n) / 10_000n;
    const distributable = pool - fee;

    expect(await shieldBet.claimablePayouts(1, alice.address)).to.equal((aliceStake * distributable) / totalWinningSide);
    expect(await shieldBet.claimablePayouts(1, bob.address)).to.equal((bobStake * distributable) / totalWinningSide);
    expect(await shieldBet.reservedPayoutBalance(1)).to.equal(distributable);

    await expect(shieldBet.connect(owner).withdrawAccruedFees(owner.address)).to.changeEtherBalances(
      [owner, shieldBet],
      [fee, -fee]
    );

    await expect(shieldBet.connect(owner).withdrawAccruedFees(owner.address)).to.be.revertedWithCustomError(
      shieldBet,
      "NothingToWithdraw"
    );
  });

  it("refunds bettors if a market is cancelled after the resolution grace period", async function () {
    const { shieldBet, owner, alice } = await deployFixture();
    const shieldBetAddress = await shieldBet.getAddress();
    const latestBlock = await ethers.provider.getBlock("latest");
    const deadline = BigInt((latestBlock?.timestamp || 0) + 3600);

    await shieldBet.connect(owner).createMarket("Cancel test", deadline);

    const aliceStake = 1_500_000_000_000_000_000n;
    const aliceBet = await encryptOutcome(shieldBetAddress, alice.address, 1);
    await shieldBet.connect(alice).placeBet(1, aliceBet.encOutcome, aliceBet.inputProof, {
      value: aliceStake
    });

    await expect(shieldBet.connect(alice).cancelUnresolvedMarket(1)).to.be.revertedWithCustomError(
      shieldBet,
      "ResolutionGracePeriodNotElapsed"
    );

    await advancePastDeadline(deadline, 7n * 24n * 60n * 60n + 1n);
    await expect(shieldBet.connect(alice).cancelUnresolvedMarket(1)).to.emit(shieldBet, "MarketCancelled").withArgs(1n);

    const refundQuote = await shieldBet.getClaimQuote(1, alice.address);
    expect(refundQuote[0]).to.equal(aliceStake);
    expect(refundQuote[1]).to.equal(true);

    await expect(() => shieldBet.connect(alice).claimWinnings(1)).to.changeEtherBalances(
      [alice, shieldBet],
      [aliceStake, -aliceStake]
    );

    expect(await shieldBet.marketPoolBalance(1)).to.equal(0n);
    expect(await shieldBet.stakeAmounts(1, alice.address)).to.equal(0n);
  });

  it("prevents resolution before deadline", async function () {
    const { shieldBet, owner } = await deployFixture();
    const deadline = BigInt((await ethers.provider.getBlock("latest"))!.timestamp + 3600);

    await shieldBet.connect(owner).createMarket("Early resolution test", deadline);

    await expect(shieldBet.connect(owner).resolveMarket(1, 1)).to.be.revertedWithCustomError(
      shieldBet,
      "MarketStillOpen"
    );
  });
});
