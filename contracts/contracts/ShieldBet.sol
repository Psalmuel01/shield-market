// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {FHE, ebool, euint8, euint64, externalEuint8} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ShieldBet is ZamaEthereumConfig, Ownable {
    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant NAME_HASH = keccak256("ShieldBet");
    bytes32 private constant VERSION_HASH = keccak256("2");
    bytes32 private constant CLAIM_ATTESTATION_TYPEHASH = keccak256(
        "ClaimAttestation(uint256 marketId,address claimant,uint8 resolvedOutcome,uint256 winningTotal,uint256 payoutDeadline)"
    );

    enum MarketType {
        Binary,
        Categorical
    }

    enum MarketStatus {
        Active,
        Expired,
        Proposed,
        Disputed,
        Finalized
    }

    enum AssetType {
        ETH,
        ERC20
    }

    uint256 public constant DISPUTE_WINDOW = 5 minutes;
    uint256 public constant ORACLE_STAKE = 0.01 ether;
    uint256 public constant PLATFORM_FEE_BPS = 500;
    uint256 public constant MAX_BPS = 10_000;

    struct Market {
        string question;
        uint256 deadline;
        uint8 outcome;
        MarketStatus status;
        MarketType marketType;
        AssetType assetType;
        address quoteToken;
        uint256 minStake;
        uint256 seedLiquidity;
        address creator;
        uint256 disputeWindowEnd;
        uint8 proposedOutcome;
        address proposer;
        address challenger;
        uint256 publishedWinningTotal;
        string[] outcomeLabels;
        euint64[] outcomeTotals;
    }

    struct MarketDetails {
        string category;
        string resolutionCriteria;
        string resolutionSource;
        string resolutionPolicy;
    }

    uint256 public marketCount;
    bytes32 private immutable DOMAIN_SEPARATOR;

    mapping(uint256 => Market) public markets;
    mapping(uint256 => MarketDetails) private marketDetails;
    mapping(uint256 => mapping(address => euint8)) private betOutcomes;
    mapping(uint256 => mapping(address => uint256)) public stakeAmounts;
    mapping(uint256 => mapping(address => bool)) public hasClaimed;
    mapping(uint256 => mapping(address => bool)) public hasPosition;
    mapping(uint256 => uint256) public totalPool;
    mapping(uint256 => bool) public marketTotalsOpened;
    mapping(uint256 => bool) public winningTotalPublished;
    mapping(uint256 => bool) public marketFeeRecorded;
    mapping(uint256 => uint256) public marketFeeAmount;
    mapping(uint256 => string) public marketMetadataCID;
    mapping(uint256 => string) public marketResolutionCID;

    address public settlementSigner;
    uint256 public accruedFeesEth;
    mapping(address => uint256) public accruedFeesToken;

    event MarketCreated(
        uint256 indexed marketId,
        string question,
        uint256 deadline,
        address indexed creator,
        MarketType marketType,
        AssetType assetType,
        address quoteToken,
        uint256 minStake,
        uint256 seedLiquidity
    );
    event BetPlaced(uint256 indexed marketId, address indexed bettor, bytes32 encOutcomeHandle, uint256 stakeAmount);
    event OutcomeProposed(uint256 indexed marketId, uint8 outcome, address indexed proposer);
    event OutcomeChallenged(uint256 indexed marketId, address indexed challenger);
    event MarketFinalized(uint256 indexed marketId, uint8 outcome, bool disputed);
    event MarketTotalsOpened(uint256 indexed marketId);
    event WinningTotalPublished(uint256 indexed marketId, uint256 winningTotal, address indexed publisher);
    event WinningsClaimed(uint256 indexed marketId, address indexed winner, uint256 payoutAmount, AssetType assetType);
    event SettlementSignerUpdated(address indexed signer);
    event FeesWithdrawn(address indexed recipient, address indexed asset, uint256 amount);

    error MarketNotFound();
    error DeadlineMustBeFuture();
    error MarketExpired();
    error MarketNotExpired();
    error MarketAlreadyProposed();
    error InvalidOutcome();
    error AlreadyHasPosition();
    error InvalidBetAmount();
    error InvalidStakeAmount();
    error UnsupportedAsset();
    error InvalidQuoteToken();
    error InsufficientStake();
    error WrongPaymentAsset();
    error NotInProposedState();
    error NotInDisputedState();
    error DisputeWindowNotExpired();
    error DisputeWindowExpired();
    error MarketNotFinalized();
    error SettlementTotalsNotOpened();
    error WinningTotalNotPublished();
    error InvalidWinningTotal();
    error AlreadyClaimed();
    error NoPosition();
    error InvalidAttestation();
    error InvalidSigner();
    error NothingToWithdraw();
    error InvalidRecipient();
    error TokenTransferFailed();

    constructor() Ownable(msg.sender) {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(EIP712_DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this))
        );
        settlementSigner = msg.sender;
    }

    function createMarketWithMetadata(
        string calldata question,
        uint256 deadline,
        MarketType marketType,
        string[] calldata outcomeLabels,
        string calldata category,
        string calldata resolutionCriteria,
        string calldata resolutionSource,
        string calldata resolutionPolicy,
        AssetType assetType,
        address quoteToken,
        uint256 minStake,
        uint256 seedLiquidity
    ) external payable returns (uint256 marketId) {
        if (deadline <= block.timestamp) revert DeadlineMustBeFuture();
        if (marketType == MarketType.Binary && outcomeLabels.length != 2) revert InvalidOutcome();
        if (marketType == MarketType.Categorical && outcomeLabels.length < 2) revert InvalidOutcome();
        if (assetType == AssetType.ETH) {
            if (quoteToken != address(0)) revert InvalidQuoteToken();
            if (msg.value != seedLiquidity) revert InvalidStakeAmount();
        } else if (assetType == AssetType.ERC20) {
            if (quoteToken == address(0)) revert InvalidQuoteToken();
            if (msg.value != 0) revert WrongPaymentAsset();
            if (seedLiquidity > 0) _safeTransferFrom(quoteToken, msg.sender, address(this), seedLiquidity);
        } else {
            revert UnsupportedAsset();
        }

        marketId = ++marketCount;
        Market storage market = markets[marketId];
        market.question = question;
        market.deadline = deadline;
        market.status = MarketStatus.Active;
        market.marketType = marketType;
        market.assetType = assetType;
        market.quoteToken = quoteToken;
        market.minStake = minStake;
        market.seedLiquidity = seedLiquidity;
        market.creator = msg.sender;
        market.outcomeLabels = outcomeLabels;

        for (uint256 i = 0; i < outcomeLabels.length; i++) {
            market.outcomeTotals.push(FHE.asEuint64(0));
            FHE.allowThis(market.outcomeTotals[i]);
        }

        marketDetails[marketId] = MarketDetails({
            category: category,
            resolutionCriteria: resolutionCriteria,
            resolutionSource: resolutionSource,
            resolutionPolicy: resolutionPolicy
        });

        emit MarketCreated(
            marketId,
            question,
            deadline,
            msg.sender,
            marketType,
            assetType,
            quoteToken,
            minStake,
            seedLiquidity
        );
    }

    function placeBet(
        uint256 marketId,
        externalEuint8 encOutcome,
        bytes calldata inputProof,
        uint256 stakeAmount
    ) external payable {
        Market storage market = _requireMarket(marketId);
        if (block.timestamp >= market.deadline) revert MarketExpired();
        if (market.status != MarketStatus.Active) revert MarketAlreadyProposed();
        if (hasPosition[marketId][msg.sender]) revert AlreadyHasPosition();
        if (stakeAmount == 0 || stakeAmount < market.minStake) revert InvalidBetAmount();
        if (stakeAmount > type(uint64).max) revert InvalidStakeAmount();

        if (market.assetType == AssetType.ETH) {
            if (msg.value != stakeAmount) revert WrongPaymentAsset();
        } else {
            if (msg.value != 0) revert WrongPaymentAsset();
            _safeTransferFrom(market.quoteToken, msg.sender, address(this), stakeAmount);
        }

        euint8 outcome = FHE.fromExternal(encOutcome, inputProof);
        euint64 amount = FHE.asEuint64(uint64(stakeAmount));

        FHE.allowThis(outcome);
        FHE.allow(outcome, msg.sender);
        FHE.allowThis(amount);

        betOutcomes[marketId][msg.sender] = outcome;
        stakeAmounts[marketId][msg.sender] = stakeAmount;
        hasPosition[marketId][msg.sender] = true;
        totalPool[marketId] += stakeAmount;

        for (uint8 i = 0; i < market.outcomeLabels.length; i++) {
            ebool isChoice = FHE.eq(outcome, FHE.asEuint8(i));
            euint64 delta = FHE.select(isChoice, amount, FHE.asEuint64(0));
            market.outcomeTotals[i] = FHE.add(market.outcomeTotals[i], delta);
            FHE.allowThis(market.outcomeTotals[i]);
        }

        emit BetPlaced(marketId, msg.sender, externalEuint8.unwrap(encOutcome), stakeAmount);
    }

    function proposeOutcome(uint256 marketId, uint8 outcomeIndex) external payable {
        Market storage market = _requireMarket(marketId);
        if (block.timestamp < market.deadline) revert MarketNotExpired();
        if (market.status != MarketStatus.Active && market.status != MarketStatus.Expired) revert MarketAlreadyProposed();
        if (outcomeIndex >= market.outcomeLabels.length) revert InvalidOutcome();
        if (msg.value < ORACLE_STAKE) revert InsufficientStake();

        market.status = MarketStatus.Proposed;
        market.proposedOutcome = outcomeIndex;
        market.proposer = msg.sender;
        market.challenger = address(0);
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

    function finalizeUndisputedOutcome(uint256 marketId) external {
        Market storage market = _requireMarket(marketId);
        if (market.status != MarketStatus.Proposed) revert NotInProposedState();
        if (block.timestamp <= market.disputeWindowEnd) revert DisputeWindowNotExpired();

        market.outcome = market.proposedOutcome;
        market.status = MarketStatus.Finalized;
        payable(market.proposer).transfer(ORACLE_STAKE);

        emit MarketFinalized(marketId, market.outcome, false);
    }

    function finalizeDisputedOutcome(uint256 marketId, uint8 finalOutcome) external onlyOwner {
        Market storage market = _requireMarket(marketId);
        if (market.status != MarketStatus.Disputed) revert NotInDisputedState();
        if (block.timestamp <= market.disputeWindowEnd) revert DisputeWindowNotExpired();
        if (finalOutcome >= market.outcomeLabels.length) revert InvalidOutcome();

        market.outcome = finalOutcome;
        market.status = MarketStatus.Finalized;

        uint256 reward = ORACLE_STAKE * 2;
        uint256 fee = (reward * PLATFORM_FEE_BPS) / MAX_BPS;
        uint256 payout = reward - fee;
        address winner = finalOutcome == market.proposedOutcome ? market.proposer : market.challenger;
        accruedFeesEth += fee;
        payable(winner).transfer(payout);

        emit MarketFinalized(marketId, finalOutcome, true);
    }

    function openSettlementTotals(uint256 marketId) external {
        Market storage market = _requireMarket(marketId);
        if (market.status != MarketStatus.Finalized) revert MarketNotFinalized();
        if (marketTotalsOpened[marketId]) return;

        for (uint256 i = 0; i < market.outcomeTotals.length; i++) {
            market.outcomeTotals[i] = FHE.makePubliclyDecryptable(market.outcomeTotals[i]);
        }

        marketTotalsOpened[marketId] = true;
        emit MarketTotalsOpened(marketId);
    }

    function publishWinningTotal(uint256 marketId, uint256 winningTotal) external {
        Market storage market = _requireMarket(marketId);
        if (market.status != MarketStatus.Finalized) revert MarketNotFinalized();
        if (!marketTotalsOpened[marketId]) revert SettlementTotalsNotOpened();
        if (msg.sender != owner() && msg.sender != settlementSigner) revert InvalidSigner();
        if (winningTotal == 0 || winningTotal > totalPool[marketId]) revert InvalidWinningTotal();

        market.publishedWinningTotal = winningTotal;
        winningTotalPublished[marketId] = true;
        _recordMarketFee(marketId);
        emit WinningTotalPublished(marketId, winningTotal, msg.sender);
    }

    function claimWinningsWithAttestation(
        uint256 marketId,
        uint8 resolvedOutcome,
        uint256 winningTotal,
        uint256 payoutDeadline,
        bytes calldata signature
    ) external {
        Market storage market = _requireMarket(marketId);
        if (market.status != MarketStatus.Finalized) revert MarketNotFinalized();
        if (!hasPosition[marketId][msg.sender]) revert NoPosition();
        if (hasClaimed[marketId][msg.sender]) revert AlreadyClaimed();
        if (!winningTotalPublished[marketId]) revert WinningTotalNotPublished();
        if (block.timestamp > payoutDeadline) revert InvalidAttestation();
        if (resolvedOutcome != market.outcome) revert InvalidAttestation();
        if (winningTotal != market.publishedWinningTotal) revert InvalidAttestation();

        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(
                    abi.encode(CLAIM_ATTESTATION_TYPEHASH, marketId, msg.sender, resolvedOutcome, winningTotal, payoutDeadline)
                )
            )
        );
        address recovered = _recoverSigner(digest, signature);
        if (recovered != settlementSigner) revert InvalidSigner();

        uint256 userStake = stakeAmounts[marketId][msg.sender];
        uint256 fee = (totalPool[marketId] * PLATFORM_FEE_BPS) / MAX_BPS;
        uint256 distributable = totalPool[marketId] + market.seedLiquidity - fee;
        uint256 payout = (userStake * distributable) / winningTotal;
        if (payout == 0) revert InvalidWinningTotal();

        hasClaimed[marketId][msg.sender] = true;
        _transferAsset(market.assetType, market.quoteToken, msg.sender, payout);
        emit WinningsClaimed(marketId, msg.sender, payout, market.assetType);
    }

    function getOutcomeTotals(uint256 marketId) external view returns (euint64[] memory) {
        return markets[marketId].outcomeTotals;
    }

    function getOutcomeLabels(uint256 marketId) external view returns (string[] memory) {
        return markets[marketId].outcomeLabels;
    }

    function getMarketDetails(
        uint256 marketId
    )
        external
        view
        returns (
            string memory category,
            string memory resolutionCriteria,
            string memory resolutionSource,
            string memory resolutionPolicy,
            uint8 assetType,
            address quoteToken,
            uint256 minStake,
            uint256 seedLiquidity,
            uint256 publishedWinningTotal,
            bool totalsOpened,
            bool winningTotalIsPublished
        )
    {
        MarketDetails storage details = marketDetails[marketId];
        Market storage market = markets[marketId];
        return (
            details.category,
            details.resolutionCriteria,
            details.resolutionSource,
            details.resolutionPolicy,
            uint8(market.assetType),
            market.quoteToken,
            market.minStake,
            market.seedLiquidity,
            market.publishedWinningTotal,
            marketTotalsOpened[marketId],
            winningTotalPublished[marketId]
        );
    }

    function getMyOutcome(uint256 marketId) external view returns (euint8) {
        return betOutcomes[marketId][msg.sender];
    }

    function getBetOutcomeHandle(uint256 marketId, address bettor) external view returns (euint8) {
        return betOutcomes[marketId][bettor];
    }

    function setSettlementSigner(address nextSigner) external onlyOwner {
        if (nextSigner == address(0)) revert InvalidRecipient();
        settlementSigner = nextSigner;
        emit SettlementSignerUpdated(nextSigner);
    }

    function withdrawAccruedFees(address recipient, address asset) external onlyOwner {
        if (recipient == address(0)) revert InvalidRecipient();

        if (asset == address(0)) {
            uint256 amount = accruedFeesEth;
            if (amount == 0) revert NothingToWithdraw();
            accruedFeesEth = 0;
            payable(recipient).transfer(amount);
            emit FeesWithdrawn(recipient, asset, amount);
            return;
        }

        uint256 tokenFees = accruedFeesToken[asset];
        if (tokenFees == 0) revert NothingToWithdraw();
        accruedFeesToken[asset] = 0;
        _safeTransfer(asset, recipient, tokenFees);
        emit FeesWithdrawn(recipient, asset, tokenFees);
    }

    function _transferAsset(AssetType assetType, address quoteToken, address recipient, uint256 amount) internal {
        if (assetType == AssetType.ETH) {
            payable(recipient).transfer(amount);
        } else {
            _safeTransfer(quoteToken, recipient, amount);
        }
    }

    function _recordMarketFee(uint256 marketId) internal {
        if (marketFeeRecorded[marketId]) return;

        Market storage market = markets[marketId];
        uint256 fee = (totalPool[marketId] * PLATFORM_FEE_BPS) / MAX_BPS;
        marketFeeRecorded[marketId] = true;
        marketFeeAmount[marketId] = fee;

        if (market.assetType == AssetType.ETH) {
            accruedFeesEth += fee;
        } else {
            accruedFeesToken[market.quoteToken] += fee;
        }
    }

    function _safeTransfer(address token, address to, uint256 amount) internal {
        (bool success, bytes memory data) = token.call(abi.encodeCall(IERC20.transfer, (to, amount)));
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) revert TokenTransferFailed();
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) internal {
        (bool success, bytes memory data) = token.call(abi.encodeCall(IERC20.transferFrom, (from, to, amount)));
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) revert TokenTransferFailed();
    }

    function _recoverSigner(bytes32 digest, bytes calldata signature) internal pure returns (address recovered) {
        if (signature.length != 65) revert InvalidAttestation();

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }

        if (v < 27) v += 27;
        if (v != 27 && v != 28) revert InvalidAttestation();
        recovered = ecrecover(digest, v, r, s);
        if (recovered == address(0)) revert InvalidAttestation();
    }

    function _requireMarket(uint256 marketId) internal view returns (Market storage market) {
        market = markets[marketId];
        if (market.deadline == 0) revert MarketNotFound();
    }
}
