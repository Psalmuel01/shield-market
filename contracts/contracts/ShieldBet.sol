// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {FHE, ebool, euint8, euint64, externalEuint8} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract ShieldBet is ZamaEthereumConfig, Ownable {
    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant NAME_HASH = keccak256("ShieldBet");
    bytes32 private constant VERSION_HASH = keccak256("1");
    uint256 private constant SECP256K1N_DIV_2 =
        0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    enum MarketType { Binary, Categorical }
    enum MarketStatus { Active, Expired, Proposed, Disputed, Finalized }

    uint256 public constant DISPUTE_WINDOW = 5 minutes;
    uint256 public constant ORACLE_STAKE = 0.01 ether;
    uint256 public constant PLATFORM_FEE_PERCENT = 10; // 10% of stake

    struct Market {
        string question;
        uint256 deadline;
        uint8 outcome; // Final outcome index
        MarketStatus status;
        MarketType marketType;
        string[] outcomeLabels;
        euint64[] outcomeTotals;
        address creator;
        uint256 disputeWindowEnd;
        uint8 proposedOutcome;
        address proposer;
        address challenger;
    }

    struct MarketDetails {
        string category;
        string resolutionCriteria;
        string resolutionSource;
    }

    uint256 public marketCount;
    bytes32 private immutable DOMAIN_SEPARATOR;

    mapping(uint256 => Market) public markets;
    mapping(uint256 => MarketDetails) private marketDetails;
    mapping(uint256 => mapping(address => euint8)) private betOutcomes;
    mapping(uint256 => mapping(address => ebool)) private settlementWinnerFlags;
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

    // Assigned after market resolution by the owner/oracle flow.
    mapping(uint256 => mapping(address => uint256)) public claimablePayouts;
    mapping(uint256 => string) public marketMetadataCID;
    mapping(uint256 => string) public marketResolutionCID;

    event MarketCreated(uint256 indexed marketId, string question, uint256 deadline, address indexed creator, MarketType marketType);
    event MarketMetadataAnchored(uint256 indexed marketId, string cid);
    event BetPlaced(uint256 indexed marketId, address indexed bettor, bytes32 encOutcomeHandle, uint256 stakeAmountWei);
    event OutcomeProposed(uint256 indexed marketId, uint8 outcome, address indexed proposer);
    event OutcomeChallenged(uint256 indexed marketId, address indexed challenger);
    event MarketFinalized(uint256 indexed marketId, uint8 outcome);
    event MarketResolutionAnchored(uint256 indexed marketId, string cid);
    event SettlementDataOpened(uint256 indexed marketId, address indexed bettor);
    event MarketTotalsOpened(uint256 indexed marketId);
    event PayoutAssigned(uint256 indexed marketId, address indexed winner, uint256 payoutAmount);
    event WinningsClaimed(uint256 indexed marketId, address indexed winner, uint256 payoutAmount);
    event FeesWithdrawn(address indexed recipient, uint256 amount);

    error MarketNotFound();
    error DeadlineMustBeFuture();
    error MarketExpired();
    error MarketAlreadyProposed();
    error MarketNotExpired();
    error InvalidOutcome();
    error AlreadyHasPosition();
    error InvalidBetAmount();
    error MarketNotFinalized();
    error AlreadyClaimed();
    error NoClaimablePayout();
    error NotMarketCreator();
    error InsufficientPoolBalance();
    error InvalidWinningTotals();
    error FeeTooHigh();
    error PayoutExceedsBalance();
    error InvalidAddressArray();
    error NothingToWithdraw();
    error MarketCancelledState();
    error MarketAlreadyFinalized();
    error InvalidStakeAmount();
    error InvalidAddress();
    error InsufficientStake();
    error DisputeWindowNotExpired();
    error DisputeWindowExpired();
    error NotInProposedState();
    error NotInDisputedState();

    constructor() Ownable(msg.sender) {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(EIP712_DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this))
        );
    }

    function createMarket(
        string calldata question,
        uint256 deadline,
        MarketType marketType,
        string[] calldata outcomeLabels
    ) external returns (uint256 marketId) {
        return _createMarket(question, deadline, marketType, outcomeLabels, "", "", "");
    }

    function createMarketWithMetadata(
        string calldata question,
        uint256 deadline,
        MarketType marketType,
        string[] calldata outcomeLabels,
        string calldata category,
        string calldata resolutionCriteria,
        string calldata resolutionSource
    ) external returns (uint256 marketId) {
        return _createMarket(question, deadline, marketType, outcomeLabels, category, resolutionCriteria, resolutionSource);
    }

    function _createMarket(
        string memory question,
        uint256 deadline,
        MarketType marketType,
        string[] memory outcomeLabels,
        string memory category,
        string memory resolutionCriteria,
        string memory resolutionSource
    ) internal returns (uint256 marketId) {
        if (deadline <= block.timestamp) revert DeadlineMustBeFuture();
        if (marketType == MarketType.Binary && outcomeLabels.length != 2) revert InvalidOutcome();
        if (marketType == MarketType.Categorical && outcomeLabels.length < 2) revert InvalidOutcome();

        marketId = ++marketCount;
         Market storage market = markets[marketId];
        market.question = question;
        market.deadline = deadline;
        market.status = MarketStatus.Active;
        market.marketType = marketType;
        market.outcomeLabels = outcomeLabels;
        market.creator = msg.sender;

        for (uint i = 0; i < outcomeLabels.length; i++) {
            market.outcomeTotals.push(FHE.asEuint64(0));
            FHE.allowThis(market.outcomeTotals[i]);
        }

        marketDetails[marketId] = MarketDetails({
            category: category,
            resolutionCriteria: resolutionCriteria,
            resolutionSource: resolutionSource
        });

        emit MarketCreated(marketId, question, deadline, msg.sender, marketType);
    }

    function placeBet(uint256 marketId, externalEuint8 encOutcome, bytes calldata inputProof) external payable {
        Market storage market = _requireMarket(marketId);
        if (block.timestamp >= market.deadline) revert MarketExpired();
        if (market.status != MarketStatus.Active) revert MarketAlreadyProposed();
        if (hasPosition[marketId][msg.sender]) revert AlreadyHasPosition();
        if (msg.value == 0) revert InvalidBetAmount();
        if (msg.value > type(uint64).max) revert InvalidStakeAmount();

        euint8 outcome = FHE.fromExternal(encOutcome, inputProof);
        euint64 amount = FHE.asEuint64(uint64(msg.value));

        FHE.allowThis(outcome);
        FHE.allow(outcome, msg.sender);
        FHE.allowThis(amount);

        betOutcomes[marketId][msg.sender] = outcome;
        stakeAmounts[marketId][msg.sender] = msg.value;
        hasPosition[marketId][msg.sender] = true;
        totalPool[marketId] += msg.value;
        marketPoolBalance[marketId] += msg.value;

        // Update outcome totals privately.
        for (uint8 i = 0; i < market.outcomeLabels.length; i++) {
            ebool isChoice = FHE.eq(outcome, FHE.asEuint8(i));
            euint64 delta = FHE.select(isChoice, amount, FHE.asEuint64(0));
            market.outcomeTotals[i] = FHE.add(market.outcomeTotals[i], delta);
            FHE.allowThis(market.outcomeTotals[i]);
        }

        emit BetPlaced(marketId, msg.sender, externalEuint8.unwrap(encOutcome), msg.value);
    }

    function proposeOutcome(uint256 marketId, uint8 outcomeIndex) external payable {
        Market storage market = _requireMarket(marketId);
        if (block.timestamp < market.deadline) revert MarketNotExpired();
        if (market.status != MarketStatus.Active) revert MarketAlreadyProposed();
        if (outcomeIndex >= market.outcomeLabels.length) revert InvalidOutcome();
        if (msg.value < ORACLE_STAKE) revert InsufficientStake();

        market.status = MarketStatus.Proposed;
        market.proposedOutcome = outcomeIndex;
        market.proposer = msg.sender;
        market.disputeWindowEnd = block.timestamp + DISPUTE_WINDOW;

        emit OutcomeProposed(marketId, outcomeIndex, msg.sender);
    }

    function challengeOutcome(uint256 marketId) external payable {
        Market storage market = _requireMarket(marketId);
        if (market.status != MarketStatus.Proposed) revert NotInProposedState();
        if (block.timestamp > market.disputeWindowEnd) revert DisputeWindowExpired();
        if (msg.value < ORACLE_STAKE) revert InsufficientStake();

        market.status = MarketStatus.Disputed;
        market.challenger = msg.sender;

        emit OutcomeChallenged(marketId, msg.sender);
    }

    function finalizeOutcome(uint256 marketId, uint8 finalOutcome) external onlyOwner {
        Market storage market = _requireMarket(marketId);
        if (market.status == MarketStatus.Proposed) {
            if (block.timestamp <= market.disputeWindowEnd) revert DisputeWindowNotExpired();
            // Proposer was right, or at least not challenged.
            market.outcome = market.proposedOutcome;
            // Return stake to proposer.
            payable(market.proposer).transfer(ORACLE_STAKE);
        } else if (market.status == MarketStatus.Disputed) {
            // Admin manually decides in case of dispute.
            market.outcome = finalOutcome;
            if (finalOutcome == market.proposedOutcome) {
                // Proposer was right.
                payable(market.proposer).transfer(ORACLE_STAKE * 190 / 100); // Proposer gets challenger's stake (minus platform fee)
                accruedFees += (ORACLE_STAKE * 10 / 100);
            } else {
                // Challenger was right.
                payable(market.challenger).transfer(ORACLE_STAKE * 190 / 100); // Challenger gets proposer's stake (minus platform fee)
                accruedFees += (ORACLE_STAKE * 10 / 100);
            }
        } else {
            revert MarketAlreadyFinalized();
        }

        market.status = MarketStatus.Finalized;
        _lockMarketFee(marketId);
        emit MarketFinalized(marketId, market.outcome);
    }

    function openSettlementData(uint256 marketId, address[] calldata bettors) external {
        Market storage market = _requireMarket(marketId);
        if (market.status != MarketStatus.Finalized) revert MarketNotFinalized();
        if (bettors.length == 0) revert InvalidAddressArray();

        if (!marketTotalsOpened[marketId]) {
            for (uint i = 0; i < market.outcomeTotals.length; i++) {
                market.outcomeTotals[i] = FHE.makePubliclyDecryptable(market.outcomeTotals[i]);
            }
            marketTotalsOpened[marketId] = true;
            emit MarketTotalsOpened(marketId);
        }

        for (uint256 i = 0; i < bettors.length; ++i) {
            address bettor = bettors[i];
            if (!hasPosition[marketId][bettor] || settlementDataOpened[marketId][bettor]) {
                continue;
            }

            ebool isWinner = FHE.eq(betOutcomes[marketId][bettor], FHE.asEuint8(market.outcome));
            settlementWinnerFlags[marketId][bettor] = FHE.makePubliclyDecryptable(isWinner);
            settlementDataOpened[marketId][bettor] = true;

            emit SettlementDataOpened(marketId, bettor);
        }
    }

    function claimWinnings(uint256 marketId) external {
        Market storage market = _requireMarket(marketId);
        if (market.status != MarketStatus.Finalized) revert MarketNotFinalized();
        if (hasClaimed[marketId][msg.sender]) revert AlreadyClaimed();

        uint256 payout = claimablePayouts[marketId][msg.sender];
        if (payout == 0) revert NoClaimablePayout();
        
        claimablePayouts[marketId][msg.sender] = 0;
        reservedPayoutBalance[marketId] -= payout;

        _finalizeClaim(marketId, msg.sender, payout);
    }

    function getOutcomeTotals(uint256 marketId) external view returns (euint64[] memory) {
        return markets[marketId].outcomeTotals;
    }

    function getOutcomeLabels(uint256 marketId) external view returns (string[] memory) {
        return markets[marketId].outcomeLabels;
    }

    function getMarketDetails(uint256 marketId) external view returns (string memory, string memory, string memory) {
        MarketDetails storage details = marketDetails[marketId];
        return (details.category, details.resolutionCriteria, details.resolutionSource);
    }

    function getMyOutcome(uint256 marketId) external view returns (euint8) {
        return betOutcomes[marketId][msg.sender];
    }

    function getBetOutcomeHandle(uint256 marketId, address bettor) external view returns (euint8) {
        return betOutcomes[marketId][bettor];
    }

    function _requireMarket(uint256 marketId) internal view returns (Market storage market) {
        market = markets[marketId];
        if (market.deadline == 0) revert MarketNotFound();
    }

    function _lockMarketFee(uint256 marketId) internal {
        if (feeLocked[marketId]) return;
        uint256 fee = (totalPool[marketId] * feeBasisPoints[marketId]) / 10_000;
        marketFeeAmount[marketId] = fee;
        feeLocked[marketId] = true;
        accruedFees += fee;
    }

    function _finalizeClaim(uint256 marketId, address recipient, uint256 payout) internal {
        hasClaimed[marketId][recipient] = true;
        marketPoolBalance[marketId] -= payout;
        payable(recipient).transfer(payout);
        emit WinningsClaimed(marketId, recipient, payout);
    }

    // Simplified payout assignment helper for this prototype phase.
    function assignPayoutManual(uint256 marketId, address winner, uint256 payout) external onlyOwner {
        Market storage market = _requireMarket(marketId);
        if (market.status != MarketStatus.Finalized) revert MarketNotFinalized();
        claimablePayouts[marketId][winner] = payout;
        reservedPayoutBalance[marketId] += payout;
        emit PayoutAssigned(marketId, winner, payout);
    }

    function withdrawAccruedFees(address payable recipient) external onlyOwner {
        uint256 amount = accruedFees;
        if (amount == 0) revert NothingToWithdraw();
        accruedFees = 0;
        recipient.transfer(amount);
        emit FeesWithdrawn(recipient, amount);
    }
}
