# Private Prediction Market – Generic Project Flow

## Overview

A **privacy-focused prediction market platform** where users can:

* Create markets
* Place bets privately
* Participate in decentralized resolution
* Earn rewards based on outcomes

**Core idea:** Users can make predictions without exposing their positions or stake publicly.

---

## 1. Connect Wallet

* Connect a compatible wallet
* Ensure the wallet supports private transactions and on-chain proofs (if required)

---

## 2. Create a Market

### Market Details

* **Title** – Pose a clear, objective question

  * Example:

    * Bad: “Will ETH go crazy?”
    * Good: “Will ETH be above $3,000 on April 1st?”
* **Category** – Crypto, Sports, Politics, Tech, etc.
* **Market Type**:

  * **Binary** – Yes / No
  * **Categorical** – Multiple outcomes

---

### Categorical Markets

* Supports multiple outcomes
* Example:

  * Option A
  * Option B
  * Option C

---

### Market Configuration

* Define all possible outcomes
* Set expiration time
* Choose settlement rules
* Select accepted token for betting

**Optional configurations:**

* Minimum stake
* Liquidity seeding
* Oracle source or verification method

---

### Confirm Creation

* Review all inputs
* Submit the transaction
* Market goes live and is ready for betting

---

## 3. Place a Bet

* Browse active markets
* Select a market and an outcome
* Enter stake amount
* Confirm transaction

**Privacy Layer:**

* Individual bets are hidden (no public linking to wallet or stake)
* Aggregated pool sizes may be visible

---

## 4. Market Lifecycle

Each market moves through these states:

1. **Active** – Users can place bets
2. **Expired** – Betting closes
3. **Resolution Proposed** – Oracle submits outcome

   * Requires staking to become an oracle
4. **Dispute Window** – Challenges allowed within a fixed timeframe

   * Disputers also stake to challenge outcomes
5. **Finalized** – Outcome locked

   * Either automatically if undisputed, or via dispute resolution (oracle vote, admin review, etc.)

---

## 5. Resolution Process (Optimistic Oracle System)

### Propose Outcome

* Oracle submits the predicted outcome
* May require:

  * Stake to discourage fraud
  * Reference to data sources

### Dispute Phase

* Users can challenge incorrect outcomes
* Dispute mechanisms may include:

  * Voting by staked users or oracles
  * Secondary oracle verification
  * Escalation to a higher authority

### Finalization

* Outcome is permanently locked
* Market state moves to **Settled**

---

## 6. Claim Rewards

* Users claim winnings if their prediction was correct
* Payout calculation:

  * Proportional to user stake
  * Based on total pool for the outcome

---

## 7. Core Features

* **Private Positions** – Hide user bets and balances; only aggregate liquidity visible
* **Binary + Categorical Markets** – Support simple and complex predictions
* **Decentralized Resolution** – Oracle + dispute system for trustless outcomes
* **Composable Tokens** – Flexible system design for supporting multiple token types in the future
* **Incentive Mechanisms** –

  * Staking rewards for honest resolution
  * Penalties for fraudulent actors
