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
      { name: "creator", type: "address" },
      { name: "disputeWindowEnd", type: "uint256" },
      { name: "proposedOutcome", type: "uint8" },
      { name: "proposer", type: "address" },
      { name: "challenger", type: "address" }
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
    name: "marketPoolBalance",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "reservedPayoutBalance",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "feeBasisPoints",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "marketFeeAmount",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "claimablePayouts",
    stateMutability: "view",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "account", type: "address" }
    ],
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
    name: "createMarket",
    stateMutability: "nonpayable",
    inputs: [
      { name: "question", type: "string" },
      { name: "deadline", type: "uint256" },
      { name: "marketType", type: "uint8" },
      { name: "outcomeLabels", type: "string[]" }
    ],
    outputs: [{ name: "marketId", type: "uint256" }]
  },
  {
    type: "function",
    name: "createMarketWithMetadata",
    stateMutability: "nonpayable",
    inputs: [
      { name: "question", type: "string" },
      { name: "deadline", type: "uint256" },
      { name: "marketType", type: "uint8" },
      { name: "outcomeLabels", type: "string[]" },
      { name: "category", type: "string" },
      { name: "resolutionCriteria", type: "string" },
      { name: "resolutionSource", type: "string" }
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
      { name: "resolutionSource", type: "string" }
    ]
  },
  {
    type: "function",
    name: "placeBet",
    stateMutability: "payable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "encOutcome", type: "bytes32" },
      { name: "inputProof", type: "bytes" }
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
    name: "finalizeOutcome",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "finalOutcome", type: "uint8" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "openSettlementData",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "bettors", type: "address[]" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "assignPayoutManual",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "winner", type: "address" },
      { name: "payout", type: "uint256" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "withdrawAccruedFees",
    stateMutability: "nonpayable",
    inputs: [{ name: "recipient", type: "address" }],
    outputs: []
  },
  {
    type: "function",
    name: "claimWinnings",
    stateMutability: "nonpayable",
    inputs: [{ name: "marketId", type: "uint256" }],
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
  }
] as const;
