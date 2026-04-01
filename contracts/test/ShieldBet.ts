import { FhevmType } from "@fhevm/hardhat-plugin";
import { expect } from "chai";
import { ethers } from "hardhat";
import * as hre from "hardhat";

const ONE_ETH = ethers.parseEther("1");
const ORACLE_STAKE = ethers.parseEther("0.01");

describe("ShieldBet", function () {
  async function deployFixture() {
    const [owner, alice, bob, carol, dave] = await ethers.getSigners();
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const mockUsdc = await MockUSDC.deploy();
    await mockUsdc.waitForDeployment();

    const ShieldBet = await ethers.getContractFactory("ShieldBet");
    const shieldBet = await ShieldBet.deploy();
    await shieldBet.waitForDeployment();

    await hre.fhevm.assertCoprocessorInitialized(shieldBet, "ShieldBet");

    const mintAmount = 1_000_000_000n;
    await mockUsdc.mint(owner.address, mintAmount);
    await mockUsdc.mint(alice.address, mintAmount);
    await mockUsdc.mint(bob.address, mintAmount);
    await mockUsdc.mint(carol.address, mintAmount);

    return { shieldBet, mockUsdc, owner, alice, bob, carol, dave };
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

  async function createEthMarket(shieldBet: any, creator: any, overrides?: { marketType?: number; labels?: string[]; minStake?: bigint }) {
    const latestBlock = await ethers.provider.getBlock("latest");
    const deadline = BigInt((latestBlock?.timestamp || 0) + 3600);
    const labels = overrides?.labels || ["YES", "NO"];
    const marketType = overrides?.marketType ?? 0;
    const minStake = overrides?.minStake ?? ethers.parseEther("0.1");

    await shieldBet.connect(creator).createMarketWithMetadata(
      "Will ShieldBet ship the realigned v2 flow?",
      deadline,
      marketType,
      labels,
      "Crypto",
      "YES if the rebuilt ShieldBet flow is live before the review deadline.",
      "Lit-assisted resolution notes + admin review",
      "Optimistic oracle with admin fallback",
      0,
      ethers.ZeroAddress,
      minStake
    );

    return { deadline, minStake };
  }

  async function createUsdcMarket(shieldBet: any, mockUsdc: any, creator: any) {
    const latestBlock = await ethers.provider.getBlock("latest");
    const deadline = BigInt((latestBlock?.timestamp || 0) + 7200);
    const minStake = 5_000_000n;

    await shieldBet.connect(creator).createMarketWithMetadata(
      "Which network will ShieldBet launch on first?",
      deadline,
      1,
      ["Sepolia", "Base", "Arbitrum"],
      "Crypto",
      "Resolves to the first production network announced in the release post.",
      "Team launch announcement",
      "Optimistic oracle with admin fallback",
      1,
      await mockUsdc.getAddress(),
      minStake
    );

    return { deadline, minStake };
  }

  function claimDomain(contractAddress: string, chainId: bigint) {
    return {
      name: "ShieldBet",
      version: "2",
      chainId,
      verifyingContract: contractAddress
    };
  }

  function claimTypes() {
    return {
      ClaimAttestation: [
        { name: "marketId", type: "uint256" },
        { name: "claimant", type: "address" },
        { name: "resolvedOutcome", type: "uint8" },
        { name: "winningTotal", type: "uint256" },
        { name: "payoutDeadline", type: "uint256" }
      ]
    };
  }

  async function signClaim(owner: any, contractAddress: string, chainId: bigint, payload: {
    marketId: bigint;
    claimant: string;
    resolvedOutcome: number;
    winningTotal: bigint;
    payoutDeadline: bigint;
  }) {
    return owner.signTypedData(claimDomain(contractAddress, chainId), claimTypes(), payload);
  }

  it("creates a binary ETH market with config and preserves encrypted side for the bettor", async function () {
    const { shieldBet, alice } = await deployFixture();
    const { deadline, minStake } = await createEthMarket(shieldBet, alice);

    const market = await shieldBet.markets(1);
    expect(market.deadline).to.equal(deadline);
    expect(market.marketType).to.equal(0n);
    expect(market.assetType).to.equal(0n);
    expect(market.minStake).to.equal(minStake);

    const details = await shieldBet.getMarketDetails(1);
    expect(details[0]).to.equal("Crypto");
    expect(details[3]).to.equal("Optimistic oracle with admin fallback");
    expect(details[4]).to.equal(0n);

    const contractAddress = await shieldBet.getAddress();
    const encrypted = await encryptOutcome(contractAddress, alice.address, 0);
    await shieldBet.connect(alice).placeBet(1, encrypted.encOutcome, encrypted.inputProof, ONE_ETH, { value: ONE_ETH });

    const outcomeHandle = await shieldBet.connect(alice).getMyOutcome(1);
    const clearOutcome = await hre.fhevm.userDecryptEuint(FhevmType.euint8, outcomeHandle, contractAddress, alice);
    expect(clearOutcome).to.equal(0n);
    expect(await shieldBet.totalPool(1)).to.equal(ONE_ETH);
  });

  it("creates a categorical USDC market and accepts ERC20 stakes", async function () {
    const { shieldBet, mockUsdc, alice, bob } = await deployFixture();
    const { minStake } = await createUsdcMarket(shieldBet, mockUsdc, alice);
    const contractAddress = await shieldBet.getAddress();

    const encrypted = await encryptOutcome(contractAddress, bob.address, 2);
    const stake = 12_500_000n;
    await mockUsdc.connect(bob).approve(contractAddress, stake);
    await shieldBet.connect(bob).placeBet(1, encrypted.encOutcome, encrypted.inputProof, stake);

    expect(await shieldBet.totalPool(1)).to.equal(stake);
    expect(await shieldBet.stakeAmounts(1, bob.address)).to.equal(stake);
    expect(await mockUsdc.balanceOf(contractAddress)).to.equal(stake);
    expect(minStake).to.equal(5_000_000n);
  });

  it("enforces the market minimum stake and the market asset", async function () {
    const { shieldBet, mockUsdc, alice, bob } = await deployFixture();
    const { minStake } = await createEthMarket(shieldBet, alice, { minStake: ethers.parseEther("0.5") });
    const contractAddress = await shieldBet.getAddress();
    const encrypted = await encryptOutcome(contractAddress, bob.address, 1);

    await expect(
      shieldBet.connect(bob).placeBet(1, encrypted.encOutcome, encrypted.inputProof, minStake - 1n, { value: minStake - 1n })
    ).to.be.revertedWithCustomError(shieldBet, "InvalidBetAmount");

    await expect(
      shieldBet.connect(bob).placeBet(1, encrypted.encOutcome, encrypted.inputProof, minStake)
    ).to.be.revertedWithCustomError(shieldBet, "WrongPaymentAsset");

    const usdcMarket = await createUsdcMarket(shieldBet, mockUsdc, alice);
    const encryptedUsdc = await encryptOutcome(contractAddress, bob.address, 1);
    await expect(
      shieldBet.connect(bob).placeBet(2, encryptedUsdc.encOutcome, encryptedUsdc.inputProof, usdcMarket.minStake, {
        value: 1n
      })
    ).to.be.revertedWithCustomError(shieldBet, "WrongPaymentAsset");
  });

  it("blocks outcome proposals before deadline", async function () {
    const { shieldBet, alice, bob } = await deployFixture();
    await createEthMarket(shieldBet, alice);
    await expect(
      shieldBet.connect(bob).proposeOutcome(1, 0, { value: ORACLE_STAKE })
    ).to.be.revertedWithCustomError(shieldBet, "MarketNotExpired");
  });

  it("supports challenge during the window and owner fallback finalization after dispute", async function () {
    const { shieldBet, owner, alice, bob } = await deployFixture();
    const { deadline } = await createEthMarket(shieldBet, alice);

    await advancePast(deadline);
    await shieldBet.connect(alice).proposeOutcome(1, 0, { value: ORACLE_STAKE });
    await expect(shieldBet.connect(bob).challengeOutcome(1, { value: ORACLE_STAKE }))
      .to.emit(shieldBet, "OutcomeChallenged")
      .withArgs(1n, bob.address);

    const proposed = await shieldBet.markets(1);
    await expect(shieldBet.connect(owner).finalizeDisputedOutcome(1, 1))
      .to.be.revertedWithCustomError(shieldBet, "DisputeWindowNotExpired");

    await advancePast(proposed.disputeWindowEnd);
    await expect(shieldBet.connect(owner).finalizeDisputedOutcome(1, 1))
      .to.emit(shieldBet, "MarketFinalized")
      .withArgs(1n, 1n, true);
  });

  it("finalizes undisputed markets permissionlessly after the dispute window", async function () {
    const { shieldBet, alice, bob } = await deployFixture();
    const { deadline } = await createEthMarket(shieldBet, alice);

    await advancePast(deadline);
    await shieldBet.connect(bob).proposeOutcome(1, 0, { value: ORACLE_STAKE });
    const proposed = await shieldBet.markets(1);

    await expect(shieldBet.connect(alice).finalizeUndisputedOutcome(1))
      .to.be.revertedWithCustomError(shieldBet, "DisputeWindowNotExpired");

    await advancePast(proposed.disputeWindowEnd);
    await expect(shieldBet.connect(alice).finalizeUndisputedOutcome(1))
      .to.emit(shieldBet, "MarketFinalized")
      .withArgs(1n, 0n, false);
  });

  it("requires published winning totals before automatic claims and pays winners pro-rata on ETH markets", async function () {
    const { shieldBet, owner, alice, bob, carol } = await deployFixture();
    const { deadline } = await createEthMarket(shieldBet, owner);
    const contractAddress = await shieldBet.getAddress();
    const chainId = (await ethers.provider.getNetwork()).chainId;

    const aliceBet = await encryptOutcome(contractAddress, alice.address, 0);
    const bobBet = await encryptOutcome(contractAddress, bob.address, 0);
    const carolBet = await encryptOutcome(contractAddress, carol.address, 1);

    await shieldBet.connect(alice).placeBet(1, aliceBet.encOutcome, aliceBet.inputProof, ethers.parseEther("1"), { value: ethers.parseEther("1") });
    await shieldBet.connect(bob).placeBet(1, bobBet.encOutcome, bobBet.inputProof, ethers.parseEther("2"), { value: ethers.parseEther("2") });
    await shieldBet.connect(carol).placeBet(1, carolBet.encOutcome, carolBet.inputProof, ethers.parseEther("1"), { value: ethers.parseEther("1") });

    await advancePast(deadline);
    await shieldBet.connect(owner).proposeOutcome(1, 0, { value: ORACLE_STAKE });
    const proposed = await shieldBet.markets(1);
    await advancePast(proposed.disputeWindowEnd);
    await shieldBet.connect(alice).finalizeUndisputedOutcome(1);

    await expect(shieldBet.connect(alice).claimWinningsWithAttestation(1, 0, ethers.parseEther("3"), BigInt((await ethers.provider.getBlock("latest"))!.timestamp + 600), "0x"))
      .to.be.reverted;

    await shieldBet.openSettlementTotals(1);
    await shieldBet.publishWinningTotal(1, ethers.parseEther("3"));

    const payoutDeadline = BigInt((await ethers.provider.getBlock("latest"))!.timestamp + 3600);
    const aliceSig = await signClaim(owner, contractAddress, chainId, {
      marketId: 1n,
      claimant: alice.address,
      resolvedOutcome: 0,
      winningTotal: ethers.parseEther("3"),
      payoutDeadline
    });
    const bobSig = await signClaim(owner, contractAddress, chainId, {
      marketId: 1n,
      claimant: bob.address,
      resolvedOutcome: 0,
      winningTotal: ethers.parseEther("3"),
      payoutDeadline
    });

    const totalPool = ethers.parseEther("4");
    const fee = (totalPool * 500n) / 10_000n;
    const distributable = totalPool - fee;
    const aliceExpected = (ethers.parseEther("1") * distributable) / ethers.parseEther("3");
    const bobExpected = (ethers.parseEther("2") * distributable) / ethers.parseEther("3");

    await expect(shieldBet.connect(carol).claimWinningsWithAttestation(1, 0, ethers.parseEther("3"), payoutDeadline, aliceSig))
      .to.be.revertedWithCustomError(shieldBet, "InvalidSigner");

    await expect(shieldBet.connect(alice).claimWinningsWithAttestation(1, 0, ethers.parseEther("3"), payoutDeadline, aliceSig))
      .to.emit(shieldBet, "WinningsClaimed")
      .withArgs(1n, alice.address, aliceExpected, 0n);

    await expect(shieldBet.connect(bob).claimWinningsWithAttestation(1, 0, ethers.parseEther("3"), payoutDeadline, bobSig))
      .to.emit(shieldBet, "WinningsClaimed")
      .withArgs(1n, bob.address, bobExpected, 0n);

    await expect(shieldBet.connect(alice).claimWinningsWithAttestation(1, 0, ethers.parseEther("3"), payoutDeadline, aliceSig))
      .to.be.revertedWithCustomError(shieldBet, "AlreadyClaimed");
  });

  it("supports automatic claims on USDC markets after winning total publication", async function () {
    const { shieldBet, mockUsdc, owner, alice, bob } = await deployFixture();
    const { deadline } = await createUsdcMarket(shieldBet, mockUsdc, owner);
    const contractAddress = await shieldBet.getAddress();
    const chainId = (await ethers.provider.getNetwork()).chainId;

    const aliceBet = await encryptOutcome(contractAddress, alice.address, 1);
    const bobBet = await encryptOutcome(contractAddress, bob.address, 0);

    await mockUsdc.connect(alice).approve(contractAddress, 10_000_000n);
    await mockUsdc.connect(bob).approve(contractAddress, 15_000_000n);
    await shieldBet.connect(alice).placeBet(1, aliceBet.encOutcome, aliceBet.inputProof, 10_000_000n);
    await shieldBet.connect(bob).placeBet(1, bobBet.encOutcome, bobBet.inputProof, 15_000_000n);

    await advancePast(deadline);
    await shieldBet.connect(owner).proposeOutcome(1, 0, { value: ORACLE_STAKE });
    const proposed = await shieldBet.markets(1);
    await advancePast(proposed.disputeWindowEnd);
    await shieldBet.finalizeUndisputedOutcome(1);

    await shieldBet.openSettlementTotals(1);
    await shieldBet.publishWinningTotal(1, 15_000_000n);

    const payoutDeadline = BigInt((await ethers.provider.getBlock("latest"))!.timestamp + 1800);
    const bobSig = await signClaim(owner, contractAddress, chainId, {
      marketId: 1n,
      claimant: bob.address,
      resolvedOutcome: 0,
      winningTotal: 15_000_000n,
      payoutDeadline
    });

    const totalPool = 25_000_000n;
    const fee = (totalPool * 500n) / 10_000n;
    const distributable = totalPool - fee;
    const bobExpected = (15_000_000n * distributable) / 15_000_000n;

    const before = await mockUsdc.balanceOf(bob.address);
    await shieldBet.connect(bob).claimWinningsWithAttestation(1, 0, 15_000_000n, payoutDeadline, bobSig);
    const after = await mockUsdc.balanceOf(bob.address);
    expect(after - before).to.equal(bobExpected);
  });
});
