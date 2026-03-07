// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, ebool, euint8, euint64, externalEuint8, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract ShieldBet is ZamaEthereumConfig, Ownable {
    struct Market {
        string question;
        uint256 deadline;
        uint8 outcome; // 0 = unresolved, 1 = YES, 2 = NO
        bool resolved;
        euint64 totalYes;
        euint64 totalNo;
        address creator;
    }

    uint256 public marketCount;

    mapping(uint256 => Market) public markets;
    mapping(uint256 => mapping(address => euint64)) private betAmounts;
    mapping(uint256 => mapping(address => euint8)) private betOutcomes;
    mapping(uint256 => mapping(address => bool)) public hasClaimed;
    mapping(uint256 => mapping(address => bool)) public hasPosition;

    // Assigned after market resolution by the owner/oracle flow (e.g. Lit Action backend).
    mapping(uint256 => mapping(address => uint256)) public claimablePayouts;

    mapping(uint256 => string) public marketMetadataCID;
    mapping(uint256 => string) public marketResolutionCID;

    event MarketCreated(uint256 indexed marketId, string question, uint256 deadline, address indexed creator);
    event MarketMetadataAnchored(uint256 indexed marketId, string cid);
    event BetPlaced(uint256 indexed marketId, address indexed bettor, bytes32 encOutcomeHandle, bytes32 encAmountHandle);
    event MarketResolved(uint256 indexed marketId, uint8 outcome);
    event MarketResolutionAnchored(uint256 indexed marketId, string cid);
    event PayoutAssigned(uint256 indexed marketId, address indexed winner, uint256 payoutAmount);
    event WinningsClaimed(uint256 indexed marketId, address indexed winner, uint256 payoutAmount);

    error MarketNotFound();
    error DeadlineMustBeFuture();
    error MarketExpired();
    error MarketAlreadyResolved();
    error InvalidOutcome();
    error AlreadyHasPosition();
    error InvalidBetAmount();
    error MarketNotResolved();
    error AlreadyClaimed();
    error NoClaimablePayout();
    error NotMarketCreator();

    constructor() Ownable(msg.sender) {}

    function createMarket(string calldata question, uint256 deadline) external returns (uint256 marketId) {
        if (deadline <= block.timestamp) revert DeadlineMustBeFuture();

        marketId = ++marketCount;
        markets[marketId] = Market({
            question: question,
            deadline: deadline,
            outcome: 0,
            resolved: false,
            totalYes: FHE.asEuint64(0),
            totalNo: FHE.asEuint64(0),
            creator: msg.sender
        });

        // Contract must retain access to encrypted accumulators across txs.
        FHE.allowThis(markets[marketId].totalYes);
        FHE.allowThis(markets[marketId].totalNo);

        emit MarketCreated(marketId, question, deadline, msg.sender);
    }

    function anchorMarketMetadataCID(uint256 marketId, string calldata cid) external {
        Market storage market = _requireMarket(marketId);
        if (market.creator != msg.sender) revert NotMarketCreator();

        marketMetadataCID[marketId] = cid;
        emit MarketMetadataAnchored(marketId, cid);
    }

    function placeBet(
        uint256 marketId,
        externalEuint8 encOutcome,
        externalEuint64 encAmount,
        bytes calldata inputProof
    ) external payable {
        Market storage market = _requireMarket(marketId);
        if (block.timestamp >= market.deadline) revert MarketExpired();
        if (market.resolved) revert MarketAlreadyResolved();
        if (hasPosition[marketId][msg.sender]) revert AlreadyHasPosition();
        if (msg.value == 0) revert InvalidBetAmount();

        euint8 outcome = FHE.fromExternal(encOutcome, inputProof);
        euint64 amount = FHE.fromExternal(encAmount, inputProof);

        // User and contract can reuse encrypted bet handles.
        FHE.allowThis(outcome);
        FHE.allow(outcome, msg.sender);
        FHE.allowThis(amount);
        FHE.allow(amount, msg.sender);

        betOutcomes[marketId][msg.sender] = outcome;
        betAmounts[marketId][msg.sender] = amount;
        hasPosition[marketId][msg.sender] = true;

        // Encrypted pool updates without decrypting outcome/amount.
        ebool isYes = FHE.eq(outcome, FHE.asEuint8(1));
        euint64 yesDelta = FHE.select(isYes, amount, FHE.asEuint64(0));
        euint64 noDelta = FHE.select(isYes, FHE.asEuint64(0), amount);

        market.totalYes = FHE.add(market.totalYes, yesDelta);
        market.totalNo = FHE.add(market.totalNo, noDelta);

        FHE.allowThis(market.totalYes);
        FHE.allowThis(market.totalNo);

        emit BetPlaced(marketId, msg.sender, externalEuint8.unwrap(encOutcome), externalEuint64.unwrap(encAmount));
    }

    function resolveMarket(uint256 marketId, uint8 outcome) external onlyOwner {
        Market storage market = _requireMarket(marketId);
        if (market.resolved) revert MarketAlreadyResolved();
        if (outcome != 1 && outcome != 2) revert InvalidOutcome();

        market.outcome = outcome;
        market.resolved = true;

        emit MarketResolved(marketId, outcome);
    }

    function anchorResolutionCID(uint256 marketId, string calldata cid) external onlyOwner {
        Market storage market = _requireMarket(marketId);
        if (!market.resolved) revert MarketNotResolved();

        marketResolutionCID[marketId] = cid;
        emit MarketResolutionAnchored(marketId, cid);
    }

    function assignWinnerPayout(uint256 marketId, address winner, uint256 payoutAmount) external onlyOwner {
        Market storage market = _requireMarket(marketId);
        if (!market.resolved) revert MarketNotResolved();

        claimablePayouts[marketId][winner] = payoutAmount;
        emit PayoutAssigned(marketId, winner, payoutAmount);
    }

    function claimWinnings(uint256 marketId) external {
        Market storage market = _requireMarket(marketId);
        if (!market.resolved) revert MarketNotResolved();
        if (hasClaimed[marketId][msg.sender]) revert AlreadyClaimed();

        uint256 payout = claimablePayouts[marketId][msg.sender];
        if (payout == 0) revert NoClaimablePayout();

        hasClaimed[marketId][msg.sender] = true;
        claimablePayouts[marketId][msg.sender] = 0;

        (bool sent, ) = msg.sender.call{value: payout}("");
        require(sent, "ETH transfer failed");

        emit WinningsClaimed(marketId, msg.sender, payout);
    }

    function getMyBet(uint256 marketId) external view returns (euint64) {
        _requireMarket(marketId);
        return betAmounts[marketId][msg.sender];
    }

    function getMyOutcome(uint256 marketId) external view returns (euint8) {
        _requireMarket(marketId);
        return betOutcomes[marketId][msg.sender];
    }

    function getEncryptedMarketTotals(uint256 marketId) external view onlyOwner returns (euint64 yesTotal, euint64 noTotal) {
        Market storage market = _requireMarket(marketId);
        return (market.totalYes, market.totalNo);
    }

    function getClaimQuote(uint256 marketId, address user) external view returns (uint256 payout, bool eligible) {
        Market storage market = _requireMarket(marketId);
        if (!market.resolved || hasClaimed[marketId][user]) return (0, false);

        payout = claimablePayouts[marketId][user];
        eligible = payout > 0;
    }

    function _requireMarket(uint256 marketId) internal view returns (Market storage market) {
        market = markets[marketId];
        if (market.deadline == 0) revert MarketNotFound();
    }
}
