// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {FHE, ebool, euint8, euint64, externalEuint8} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract ShieldBet is ZamaEthereumConfig, Ownable {
    uint8 public constant OUTCOME_UNRESOLVED = 0;
    uint8 public constant OUTCOME_YES = 1;
    uint8 public constant OUTCOME_NO = 2;
    uint8 public constant OUTCOME_CANCELLED = 3;
    uint256 public constant RESOLUTION_GRACE_PERIOD = 7 days;

    struct Market {
        string question;
        uint256 deadline;
        uint8 outcome; // 0 = unresolved, 1 = YES, 2 = NO, 3 = cancelled
        bool resolved;
        euint64 totalYes;
        euint64 totalNo;
        address creator;
    }

    struct MarketDetails {
        string category;
        string resolutionCriteria;
        string resolutionSource;
    }

    uint256 public marketCount;

    mapping(uint256 => Market) public markets;
    mapping(uint256 => MarketDetails) private marketDetails;
    mapping(uint256 => mapping(address => euint8)) private betOutcomes;
    mapping(uint256 => mapping(address => uint256)) public stakeAmounts;
    mapping(uint256 => mapping(address => bool)) public hasClaimed;
    mapping(uint256 => mapping(address => bool)) public hasPosition;
    mapping(uint256 => uint256) public totalPool;
    mapping(uint256 => uint256) public marketPoolBalance;
    mapping(uint256 => uint256) public reservedPayoutBalance;
    mapping(uint256 => uint256) public feeBasisPoints;
    mapping(uint256 => uint256) public marketFeeAmount;
    mapping(uint256 => mapping(address => bool)) public settlementDataOpened;
    mapping(uint256 => bool) public marketTotalsOpened;
    mapping(uint256 => bool) public feeLocked;
    uint256 public accruedFees;

    // Assigned after market resolution by the owner/oracle flow (e.g. Lit Action backend).
    mapping(uint256 => mapping(address => uint256)) public claimablePayouts;

    mapping(uint256 => string) public marketMetadataCID;
    mapping(uint256 => string) public marketResolutionCID;

    event MarketCreated(uint256 indexed marketId, string question, uint256 deadline, address indexed creator);
    event MarketMetadataAnchored(uint256 indexed marketId, string cid);
    event BetPlaced(uint256 indexed marketId, address indexed bettor, bytes32 encOutcomeHandle, uint256 stakeAmountWei);
    event MarketResolved(uint256 indexed marketId, uint8 outcome);
    event MarketCancelled(uint256 indexed marketId);
    event MarketResolutionAnchored(uint256 indexed marketId, string cid);
    event SettlementDataOpened(uint256 indexed marketId, address indexed bettor);
    event MarketTotalsOpened(uint256 indexed marketId);
    event PayoutAssigned(uint256 indexed marketId, address indexed winner, uint256 payoutAmount);
    event WinningsClaimed(uint256 indexed marketId, address indexed winner, uint256 payoutAmount);
    event FeesWithdrawn(address indexed recipient, uint256 amount);

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
    error InsufficientPoolBalance();
    error MarketStillOpen();
    error InvalidWinningTotals();
    error FeeTooHigh();
    error PayoutExceedsBalance();
    error InvalidAddressArray();
    error NothingToWithdraw();
    error MarketCancelledState();
    error MarketAlreadyFinalized();
    error ResolutionGracePeriodNotElapsed();
    error InvalidStakeAmount();

    constructor() Ownable(msg.sender) {}

    function createMarket(string calldata question, uint256 deadline) external returns (uint256 marketId) {
        return _createMarket(question, deadline, "", "", "");
    }

    function createMarketWithMetadata(
        string calldata question,
        uint256 deadline,
        string calldata category,
        string calldata resolutionCriteria,
        string calldata resolutionSource
    ) external returns (uint256 marketId) {
        return _createMarket(question, deadline, category, resolutionCriteria, resolutionSource);
    }

    function getMarketDetails(
        uint256 marketId
    ) external view returns (string memory category, string memory resolutionCriteria, string memory resolutionSource) {
        _requireMarket(marketId);
        MarketDetails storage details = marketDetails[marketId];
        return (details.category, details.resolutionCriteria, details.resolutionSource);
    }

    function _createMarket(
        string memory question,
        uint256 deadline,
        string memory category,
        string memory resolutionCriteria,
        string memory resolutionSource
    ) internal returns (uint256 marketId) {
        if (deadline <= block.timestamp) revert DeadlineMustBeFuture();

        marketId = ++marketCount;
        markets[marketId] = Market({
            question: question,
            deadline: deadline,
            outcome: OUTCOME_UNRESOLVED,
            resolved: false,
            totalYes: FHE.asEuint64(0),
            totalNo: FHE.asEuint64(0),
            creator: msg.sender
        });
        marketDetails[marketId] = MarketDetails({
            category: category,
            resolutionCriteria: resolutionCriteria,
            resolutionSource: resolutionSource
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
        bytes calldata inputProof
    ) external payable {
        Market storage market = _requireMarket(marketId);
        if (block.timestamp >= market.deadline) revert MarketExpired();
        if (market.resolved) revert MarketAlreadyResolved();
        if (hasPosition[marketId][msg.sender]) revert AlreadyHasPosition();
        if (msg.value == 0) revert InvalidBetAmount();
        if (msg.value > type(uint64).max) revert InvalidStakeAmount();

        euint8 outcome = FHE.fromExternal(encOutcome, inputProof);
        euint64 amount = FHE.asEuint64(uint64(msg.value));

        // User and contract can reuse encrypted bet handles.
        FHE.allowThis(outcome);
        FHE.allow(outcome, msg.sender);
        FHE.allowThis(amount);

        betOutcomes[marketId][msg.sender] = outcome;
        stakeAmounts[marketId][msg.sender] = msg.value;
        hasPosition[marketId][msg.sender] = true;
        totalPool[marketId] += msg.value;
        marketPoolBalance[marketId] += msg.value;

        // Encrypted pool updates without decrypting outcome/amount.
        ebool isYes = FHE.eq(outcome, FHE.asEuint8(1));
        euint64 yesDelta = FHE.select(isYes, amount, FHE.asEuint64(0));
        euint64 noDelta = FHE.select(isYes, FHE.asEuint64(0), amount);

        market.totalYes = FHE.add(market.totalYes, yesDelta);
        market.totalNo = FHE.add(market.totalNo, noDelta);

        FHE.allowThis(market.totalYes);
        FHE.allowThis(market.totalNo);

        emit BetPlaced(marketId, msg.sender, externalEuint8.unwrap(encOutcome), msg.value);
    }

    function resolveMarket(uint256 marketId, uint8 outcome) external onlyOwner {
        Market storage market = _requireMarket(marketId);
        if (market.resolved) revert MarketAlreadyResolved();
        if (block.timestamp < market.deadline) revert MarketStillOpen();
        if (outcome != OUTCOME_YES && outcome != OUTCOME_NO) revert InvalidOutcome();

        market.outcome = outcome;
        market.resolved = true;
        _lockMarketFee(marketId);

        emit MarketResolved(marketId, outcome);
    }

    function cancelUnresolvedMarket(uint256 marketId) external {
        Market storage market = _requireMarket(marketId);
        if (market.resolved) revert MarketAlreadyFinalized();
        if (block.timestamp < market.deadline + RESOLUTION_GRACE_PERIOD) revert ResolutionGracePeriodNotElapsed();

        market.outcome = OUTCOME_CANCELLED;
        market.resolved = true;
        feeLocked[marketId] = true;
        marketFeeAmount[marketId] = 0;

        emit MarketCancelled(marketId);
    }

    function anchorResolutionCID(uint256 marketId, string calldata cid) external onlyOwner {
        Market storage market = _requireMarket(marketId);
        if (!market.resolved) revert MarketNotResolved();

        marketResolutionCID[marketId] = cid;
        emit MarketResolutionAnchored(marketId, cid);
    }

    function setMarketFeeBasisPoints(uint256 marketId, uint256 feeBps) external onlyOwner {
        Market storage market = _requireMarket(marketId);
        if (market.resolved) revert MarketAlreadyResolved();
        if (feeBps > 10_000) revert FeeTooHigh();

        feeBasisPoints[marketId] = feeBps;
    }

    function computeAndAssignPayout(
        uint256 marketId,
        address winner,
        uint256 winnerBetAmount,
        uint256 totalWinningSide
    ) external onlyOwner {
        _computeAndAssignPayout(marketId, winner, winnerBetAmount, totalWinningSide);
    }

    function computeAndAssignPayouts(
        uint256 marketId,
        address[] calldata winners,
        uint256[] calldata winnerBetAmounts,
        uint256 totalWinningSide
    ) external onlyOwner {
        uint256 length = winners.length;
        if (length == 0 || length != winnerBetAmounts.length) revert InvalidAddressArray();

        for (uint256 i = 0; i < length; ++i) {
            _computeAndAssignPayout(marketId, winners[i], winnerBetAmounts[i], totalWinningSide);
        }
    }

    function openSettlementData(uint256 marketId, address[] calldata bettors) external {
        Market storage market = _requireMarket(marketId);
        if (!market.resolved) revert MarketNotResolved();
        if (market.outcome == OUTCOME_CANCELLED) revert MarketCancelledState();
        if (bettors.length == 0) revert InvalidAddressArray();

        if (!marketTotalsOpened[marketId]) {
            market.totalYes = FHE.makePubliclyDecryptable(market.totalYes);
            market.totalNo = FHE.makePubliclyDecryptable(market.totalNo);
            marketTotalsOpened[marketId] = true;
            emit MarketTotalsOpened(marketId);
        }

        for (uint256 i = 0; i < bettors.length; ++i) {
            address bettor = bettors[i];
            if (!hasPosition[marketId][bettor] || settlementDataOpened[marketId][bettor]) {
                continue;
            }

            betOutcomes[marketId][bettor] = FHE.makePubliclyDecryptable(betOutcomes[marketId][bettor]);
            settlementDataOpened[marketId][bettor] = true;

            emit SettlementDataOpened(marketId, bettor);
        }
    }

    function withdrawAccruedFees(address payable recipient) external onlyOwner {
        uint256 amount = accruedFees;
        if (amount == 0) revert NothingToWithdraw();
        accruedFees = 0;

        (bool sent, ) = recipient.call{value: amount}("");
        require(sent, "ETH transfer failed");

        emit FeesWithdrawn(recipient, amount);
    }

    function claimWinnings(uint256 marketId) external {
        Market storage market = _requireMarket(marketId);
        if (!market.resolved) revert MarketNotResolved();
        if (hasClaimed[marketId][msg.sender]) revert AlreadyClaimed();

        uint256 payout;
        if (market.outcome == OUTCOME_CANCELLED) {
            payout = stakeAmounts[marketId][msg.sender];
            if (payout == 0) revert NoClaimablePayout();
        } else {
            payout = claimablePayouts[marketId][msg.sender];
            if (payout == 0) revert NoClaimablePayout();
            claimablePayouts[marketId][msg.sender] = 0;
            reservedPayoutBalance[marketId] -= payout;
        }

        hasClaimed[marketId][msg.sender] = true;
        stakeAmounts[marketId][msg.sender] = 0;
        marketPoolBalance[marketId] -= payout;

        (bool sent, ) = msg.sender.call{value: payout}("");
        require(sent, "ETH transfer failed");

        emit WinningsClaimed(marketId, msg.sender, payout);
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

        payout = market.outcome == OUTCOME_CANCELLED ? stakeAmounts[marketId][user] : claimablePayouts[marketId][user];
        eligible = payout > 0;
    }

    function _requireMarket(uint256 marketId) internal view returns (Market storage market) {
        market = markets[marketId];
        if (market.deadline == 0) revert MarketNotFound();
    }

    function _computeAndAssignPayout(
        uint256 marketId,
        address winner,
        uint256 winnerBetAmount,
        uint256 totalWinningSide
    ) internal {
        Market storage market = _requireMarket(marketId);
        if (!market.resolved) revert MarketNotResolved();
        if (market.outcome == OUTCOME_CANCELLED) revert MarketCancelledState();
        if (!feeLocked[marketId]) revert MarketNotResolved();
        if (hasClaimed[marketId][winner]) revert AlreadyClaimed();
        if (winnerBetAmount == 0 || totalWinningSide == 0 || winnerBetAmount > totalWinningSide) revert InvalidWinningTotals();
        if (stakeAmounts[marketId][winner] != winnerBetAmount) revert InvalidWinningTotals();

        uint256 pool = totalPool[marketId];
        uint256 fee = marketFeeAmount[marketId];
        uint256 distributablePool = pool - fee;
        uint256 payout = (winnerBetAmount * distributablePool) / totalWinningSide;
        if (payout > address(this).balance) revert PayoutExceedsBalance();

        uint256 previousPayout = claimablePayouts[marketId][winner];
        uint256 reservedBalance = reservedPayoutBalance[marketId];
        if (payout > previousPayout) {
            uint256 additionalReservation = payout - previousPayout;
            if (reservedBalance + additionalReservation > distributablePool) revert InsufficientPoolBalance();
            reservedPayoutBalance[marketId] = reservedBalance + additionalReservation;
        } else if (previousPayout > payout) {
            reservedPayoutBalance[marketId] = reservedBalance - (previousPayout - payout);
        }

        claimablePayouts[marketId][winner] = payout;
        emit PayoutAssigned(marketId, winner, payout);
    }

    function _lockMarketFee(uint256 marketId) internal {
        if (feeLocked[marketId]) return;

        uint256 fee = (totalPool[marketId] * feeBasisPoints[marketId]) / 10_000;
        marketFeeAmount[marketId] = fee;
        feeLocked[marketId] = true;
        accruedFees += fee;
    }
}
