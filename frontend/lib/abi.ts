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
      { name: "resolved", type: "bool" },
      { name: "totalYes", type: "bytes32" },
      { name: "totalNo", type: "bytes32" },
      { name: "creator", type: "address" }
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
    name: "createMarket",
    stateMutability: "nonpayable",
    inputs: [
      { name: "question", type: "string" },
      { name: "deadline", type: "uint256" }
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
    name: "anchorMarketMetadataCID",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "cid", type: "string" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "anchorResolutionCID",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "cid", type: "string" }
    ],
    outputs: []
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
    name: "resolveMarket",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "outcome", type: "uint8" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "cancelUnresolvedMarket",
    stateMutability: "nonpayable",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: []
  },
  {
    type: "function",
    name: "setMarketFeeBasisPoints",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "feeBps", type: "uint256" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "computeAndAssignPayout",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "winner", type: "address" },
      { name: "winnerBetAmount", type: "uint256" },
      { name: "totalWinningSide", type: "uint256" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "computeAndAssignPayouts",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "winners", type: "address[]" },
      { name: "winnerBetAmounts", type: "uint256[]" },
      { name: "totalWinningSide", type: "uint256" }
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
    name: "getClaimQuote",
    stateMutability: "view",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "user", type: "address" }
    ],
    outputs: [
      { name: "payout", type: "uint256" },
      { name: "eligible", type: "bool" }
    ]
  },
  {
    type: "function",
    name: "RESOLUTION_GRACE_PERIOD",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  }
] as const;
