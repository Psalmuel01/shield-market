# ShieldBet

Confidential prediction markets prototype for PL Genesis 2026.

ShieldBet implements a two-surface dApp (Markets dashboard + Bet page) backed by a market smart contract with encrypted-position interfaces, resolution flow, claim logic, and Filecoin/Lit integration seams.

## Monorepo Layout

- `contracts/`: Hardhat project with `ShieldBet.sol`, tests, and deploy script.
- `frontend/`: Next.js app with RainbowKit wallet connect, dashboard, bet page, and mock Lit claim endpoint.

## Architecture

```mermaid
flowchart LR
  U[User Wallet] --> F[Next.js Frontend]
  F --> C[ShieldBet.sol on Zama Testnet]
  F --> L[Lit Action API Seam]
  F --> FI[Filecoin Upload Seam]
  FI --> FC[Filecoin Calibration CID]
  C --> FC
  L --> U
```

## Smart Contract Scope

`contracts/contracts/ShieldBet.sol` includes:

- `createMarket(question, deadline) -> marketId`
- `placeBet(marketId, encOutcome, encAmount, proof)` (payable)
- `resolveMarket(marketId, outcome)` (`onlyOwner`)
- `claimWinnings(marketId)`
- `getMyBet(marketId) -> euint64-style value`
- payout calculation from winner share of losing pool
- CID anchoring hooks:
  - `anchorMarketMetadataCID(marketId, cid)`
  - `anchorResolutionCID(marketId, cid)`

Notes:
- For local development, encrypted types are represented with Solidity value types (`euint64`, `euint8`, `einput`) and proof validation is deterministic.
- The contract surface and transaction shape are prepared for fhEVM plugin swap-in.

## Frontend Scope

`frontend` implements:

- Wallet connection via wagmi + RainbowKit
- `/markets` dashboard with:
  - market cards
  - open/resolved status
  - encrypted volume label
  - market/resolution CID links
  - claim CTA for eligible winners
- `/markets/[id]` bet page with:
  - YES/NO selection
  - amount entry
  - client-side encryption payload creation
  - confidential position confirmation
  - claim flow + Lit response reveal
- `app/api/lit/claim` integration seam:
  - returns mock decrypted payout if Lit secrets are absent
  - returns Lit-mode payload when `LIT_ACTION_CID` is configured

## Quick Start

### 1) Contracts

```bash
cd /Users/sam/Desktop/Projects/ShieldBet/contracts
npm install
npm test
```

Deploy:

```bash
cp .env.example .env
# set ZAMA_RPC_URL and DEPLOYER_PRIVATE_KEY
npm run deploy:zama
```

### 2) Frontend

```bash
cd /Users/sam/Desktop/Projects/ShieldBet/frontend
npm install
cp .env.example .env.local
# set NEXT_PUBLIC_SHIELDBET_ADDRESS and chain values
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Env Configuration

### Contracts (`contracts/.env`)

- `ZAMA_RPC_URL`
- `DEPLOYER_PRIVATE_KEY`

### Frontend (`frontend/.env.local`)

- `NEXT_PUBLIC_CHAIN_ID`
- `NEXT_PUBLIC_CHAIN_NAME`
- `NEXT_PUBLIC_CHAIN_RPC_URL`
- `NEXT_PUBLIC_CHAIN_EXPLORER`
- `NEXT_PUBLIC_SHIELDBET_ADDRESS`
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
- `LIT_ACTION_CID` (optional)
- `LIT_NETWORK` (optional)
- `LIT_RECAP` (optional)

## Demo Flow (PRD-aligned)

1. Open `/markets`, connect wallet.
2. Open a market and place an encrypted bet (payload encoded client-side).
3. Resolve market from admin wallet (`resolveMarket`) or Hardhat console.
4. Claim winnings from winner wallet.
5. Verify anchored CIDs from dashboard links.

## Next Integration Tasks

- Replace placeholder encrypted type handling with official Zama fhEVM contract/plugin primitives.
- Replace `lib/filecoin.ts` mocks with Synapse SDK uploads to Calibration testnet.
- Replace `/api/lit/claim` mock path with real PKP + Lit Action execution and access-control checks.
