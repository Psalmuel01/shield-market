export const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" }
    ],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }]
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }]
  }
] as const;

export const shieldBetAbi = [
  {
    type: "function",
    name: "marketCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "markets",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [
      { name: "question", type: "string" },
      { name: "deadline", type: "uint256" },
      { name: "outcome", type: "uint8" },
      { name: "status", type: "uint8" },
      { name: "marketType", type: "uint8" },
      { name: "assetType", type: "uint8" },
      { name: "quoteToken", type: "address" },
      { name: "minStake", type: "uint256" },
      { name: "seedLiquidity", type: "uint256" },
      { name: "creator", type: "address" },
      { name: "disputeWindowEnd", type: "uint256" },
      { name: "proposedOutcome", type: "uint8" },
      { name: "proposer", type: "address" },
      { name: "challenger", type: "address" },
      { name: "publishedWinningTotal", type: "uint256" }
    ]
  },
  {
    type: "function",
    name: "marketMetadataCID",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }]
  },
  {
    type: "function",
    name: "marketResolutionCID",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }]
  },
  {
    type: "function",
    name: "totalPool",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "stakeAmounts",
    stateMutability: "view",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "account", type: "address" }
    ],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "hasClaimed",
    stateMutability: "view",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "account", type: "address" }
    ],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "hasPosition",
    stateMutability: "view",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "account", type: "address" }
    ],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "marketTotalsOpened",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "winningTotalPublished",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "settlementSigner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "createMarketWithMetadata",
    stateMutability: "payable",
    inputs: [
      { name: "question", type: "string" },
      { name: "deadline", type: "uint256" },
      { name: "marketType", type: "uint8" },
      { name: "outcomeLabels", type: "string[]" },
      { name: "category", type: "string" },
      { name: "resolutionCriteria", type: "string" },
      { name: "resolutionSource", type: "string" },
      { name: "resolutionPolicy", type: "string" },
      { name: "assetType", type: "uint8" },
      { name: "quoteToken", type: "address" },
      { name: "minStake", type: "uint256" },
      { name: "seedLiquidity", type: "uint256" }
    ],
    outputs: [{ name: "marketId", type: "uint256" }]
  },
  {
    type: "function",
    name: "getMarketDetails",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [
      { name: "category", type: "string" },
      { name: "resolutionCriteria", type: "string" },
      { name: "resolutionSource", type: "string" },
      { name: "resolutionPolicy", type: "string" },
      { name: "assetType", type: "uint8" },
      { name: "quoteToken", type: "address" },
      { name: "minStake", type: "uint256" },
      { name: "seedLiquidity", type: "uint256" },
      { name: "publishedWinningTotal", type: "uint256" },
      { name: "totalsOpened", type: "bool" },
      { name: "winningTotalIsPublished", type: "bool" }
    ]
  },
  {
    type: "function",
    name: "placeBet",
    stateMutability: "payable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "encOutcome", type: "bytes32" },
      { name: "inputProof", type: "bytes" },
      { name: "stakeAmount", type: "uint256" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "proposeOutcome",
    stateMutability: "payable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "outcomeIndex", type: "uint8" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "challengeOutcome",
    stateMutability: "payable",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: []
  },
  {
    type: "function",
    name: "finalizeUndisputedOutcome",
    stateMutability: "nonpayable",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: []
  },
  {
    type: "function",
    name: "finalizeDisputedOutcome",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "finalOutcome", type: "uint8" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "openSettlementTotals",
    stateMutability: "nonpayable",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: []
  },
  {
    type: "function",
    name: "publishWinningTotal",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "winningTotal", type: "uint256" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "claimWinningsWithAttestation",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "resolvedOutcome", type: "uint8" },
      { name: "winningTotal", type: "uint256" },
      { name: "payoutDeadline", type: "uint256" },
      { name: "signature", type: "bytes" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "getMyOutcome",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [{ name: "", type: "bytes32" }]
  },
  {
    type: "function",
    name: "getBetOutcomeHandle",
    stateMutability: "view",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "bettor", type: "address" }
    ],
    outputs: [{ name: "", type: "bytes32" }]
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "getOutcomeTotals",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [{ name: "", type: "bytes32[]" }]
  },
  {
    type: "function",
    name: "getOutcomeLabels",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [{ name: "", type: "string[]" }]
  },
  {
    type: "function",
    name: "DISPUTE_WINDOW",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "ORACLE_STAKE",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "event",
    name: "WinningsClaimed",
    inputs: [
      { indexed: true, name: "marketId", type: "uint256" },
      { indexed: true, name: "winner", type: "address" },
      { indexed: false, name: "payoutAmount", type: "uint256" },
      { indexed: false, name: "assetType", type: "uint8" }
    ],
    anonymous: false
  }
] as const;
