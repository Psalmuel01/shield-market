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

  async function encryptOutcome(contractAddress: string, bettorAddress: string, outcomeIndex: number) {
    const input = hre.fhevm.createEncryptedInput(contractAddress, bettorAddress);
    input.add8(outcomeIndex);
    const encrypted = await input.encrypt();

    return {
      encOutcome: encrypted.handles[0],
      inputProof: encrypted.inputProof
    };
  }

  async function advanceTo(timestamp: bigint) {
    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(timestamp)]);
    await ethers.provider.send("evm_mine", []);
  }

  async function advancePast(timestamp: bigint, secondsAfter = 1n) {
    await advanceTo(timestamp + secondsAfter);
  }

  async function createBinaryMarket(shieldBet: Awaited<ReturnType<typeof deployFixture>>["shieldBet"], creator = 0) {
    const signers = await ethers.getSigners();
    const latestBlock = await ethers.provider.getBlock("latest");
    const deadline = BigInt((latestBlock?.timestamp || 0) + 3600);

    await shieldBet.connect(signers[creator]).createMarketWithMetadata(
      "Will ShieldBet v1 stabilize on Sepolia?",
      deadline,
      0,
      ["YES", "NO"],
      "Crypto",
      "Resolves YES if the owner-driven flow completes after the deadline.",
      "Owner settlement"
    );

    return { deadline };
  }

  it("creates a market with metadata and preserves encrypted outcome handles", async function () {
    const { shieldBet, alice } = await deployFixture();
    const deadline = BigInt((await ethers.provider.getBlock("latest"))!.timestamp + 3600);

    await expect(
      shieldBet.connect(alice).createMarketWithMetadata(
        "Will ETH close above $5k?",
        deadline,
        0,
        ["YES", "NO"],
        "Crypto",
        "YES if the reference ETH price is above $5,000 at deadline.",
        "Owner settlement"
      )
    )
      .to.emit(shieldBet, "MarketCreated")
      .withArgs(1n, "Will ETH close above $5k?", deadline, alice.address, 0n);

    const details = await shieldBet.getMarketDetails(1);
    expect(details[0]).to.equal("Crypto");
    expect(details[1]).to.equal("YES if the reference ETH price is above $5,000 at deadline.");
    expect(details[2]).to.equal("Owner settlement");

    const contractAddress = await shieldBet.getAddress();
    const encrypted = await encryptOutcome(contractAddress, alice.address, 0);
    await shieldBet.connect(alice).placeBet(1, encrypted.encOutcome, encrypted.inputProof, {
      value: ethers.parseEther("1")
    });

    expect(await shieldBet.stakeAmounts(1, alice.address)).to.equal(ethers.parseEther("1"));
    expect(await shieldBet.totalPool(1)).to.equal(ethers.parseEther("1"));

    const outcomeHandle = await shieldBet.connect(alice).getMyOutcome(1);
    const clearOutcome = await hre.fhevm.userDecryptEuint(
      FhevmType.euint8,
      outcomeHandle,
      contractAddress,
      alice
    );

    expect(clearOutcome).to.equal(0n);
  });

  it("blocks proposing an outcome before the deadline", async function () {
    const { shieldBet, alice } = await deployFixture();
    await createBinaryMarket(shieldBet);

    await expect(
      shieldBet.connect(alice).proposeOutcome(1, 0, {
        value: ethers.parseEther("0.01")
      })
    ).to.be.revertedWithCustomError(shieldBet, "MarketNotExpired");
  });

  it("supports propose, challenge, and owner finalization after the dispute window", async function () {
    const { shieldBet, owner, alice, bob } = await deployFixture();
    const { deadline } = await createBinaryMarket(shieldBet);

    const oracleStake = await shieldBet.ORACLE_STAKE();

    await advancePast(deadline);

    await expect(
      shieldBet.connect(alice).proposeOutcome(1, 0, {
        value: oracleStake
      })
    )
      .to.emit(shieldBet, "OutcomeProposed")
      .withArgs(1n, 0n, alice.address);

    const proposedMarket = await shieldBet.markets(1);
    expect(proposedMarket.status).to.equal(2n);

    await expect(
      shieldBet.connect(owner).finalizeOutcome(1, 0)
    ).to.be.revertedWithCustomError(shieldBet, "DisputeWindowNotExpired");

    await expect(
      shieldBet.connect(bob).challengeOutcome(1, {
        value: oracleStake
      })
    )
      .to.emit(shieldBet, "OutcomeChallenged")
      .withArgs(1n, bob.address);

    await expect(shieldBet.connect(owner).finalizeOutcome(1, 1))
      .to.emit(shieldBet, "MarketFinalized")
      .withArgs(1n, 1);

    const finalizedMarket = await shieldBet.markets(1);
    expect(finalizedMarket.status).to.equal(4n);
    expect(finalizedMarket.outcome).to.equal(1n);
  });

  it("finalizes an undisputed proposal only after the dispute window expires", async function () {
    const { shieldBet, owner, alice } = await deployFixture();
    const { deadline } = await createBinaryMarket(shieldBet);
    const oracleStake = await shieldBet.ORACLE_STAKE();

    await advancePast(deadline);
    await shieldBet.connect(alice).proposeOutcome(1, 0, { value: oracleStake });

    const proposedMarket = await shieldBet.markets(1);
    await advancePast(proposedMarket.disputeWindowEnd);

    await expect(shieldBet.connect(owner).finalizeOutcome(1, 0))
      .to.emit(shieldBet, "MarketFinalized")
      .withArgs(1n, 0);

    const finalizedMarket = await shieldBet.markets(1);
    expect(finalizedMarket.status).to.equal(4n);
    expect(finalizedMarket.outcome).to.equal(0n);
  });

  it("opens settlement data, lets the owner assign payout manually, and allows a single successful claim", async function () {
    const { shieldBet, owner, alice, bob, carol } = await deployFixture();
    const { deadline } = await createBinaryMarket(shieldBet);
    const contractAddress = await shieldBet.getAddress();

    const aliceStake = ethers.parseEther("1");
    const bobStake = ethers.parseEther("0.4");

    const aliceBet = await encryptOutcome(contractAddress, alice.address, 0);
    await shieldBet.connect(alice).placeBet(1, aliceBet.encOutcome, aliceBet.inputProof, { value: aliceStake });

    const bobBet = await encryptOutcome(contractAddress, bob.address, 1);
    await shieldBet.connect(bob).placeBet(1, bobBet.encOutcome, bobBet.inputProof, { value: bobStake });

    await advancePast(deadline);

    const oracleStake = await shieldBet.ORACLE_STAKE();
    await shieldBet.connect(carol).proposeOutcome(1, 0, { value: oracleStake });

    const proposedMarket = await shieldBet.markets(1);
    await advancePast(proposedMarket.disputeWindowEnd);
    await shieldBet.connect(owner).finalizeOutcome(1, 0);

    await expect(shieldBet.connect(bob).openSettlementData(1, [alice.address, bob.address]))
      .to.emit(shieldBet, "MarketTotalsOpened")
      .withArgs(1n);

    expect(await shieldBet.marketTotalsOpened(1)).to.equal(true);
    expect(await shieldBet.settlementDataOpened(1, alice.address)).to.equal(true);
    expect(await shieldBet.settlementDataOpened(1, bob.address)).to.equal(true);

    const totalPool = aliceStake + bobStake;

    await expect(shieldBet.connect(owner).assignPayoutManual(1, alice.address, totalPool))
      .to.emit(shieldBet, "PayoutAssigned")
      .withArgs(1n, alice.address, totalPool);

    expect(await shieldBet.claimablePayouts(1, alice.address)).to.equal(totalPool);
    expect(await shieldBet.reservedPayoutBalance(1)).to.equal(totalPool);

    await expect(shieldBet.connect(bob).claimWinnings(1)).to.be.revertedWithCustomError(
      shieldBet,
      "NoClaimablePayout"
    );

    await expect(shieldBet.connect(alice).claimWinnings(1))
      .to.emit(shieldBet, "WinningsClaimed")
      .withArgs(1n, alice.address, totalPool);

    expect(await shieldBet.hasClaimed(1, alice.address)).to.equal(true);
    expect(await shieldBet.claimablePayouts(1, alice.address)).to.equal(0n);
    expect(await shieldBet.reservedPayoutBalance(1)).to.equal(0n);

    await expect(shieldBet.connect(alice).claimWinnings(1)).to.be.revertedWithCustomError(
      shieldBet,
      "AlreadyClaimed"
    );
  });
});
