"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Calendar, Check, Coins, FileText, Plus, ShieldCheck, Tag, Trash2 } from "lucide-react";
import { decodeEventLog, parseAbiItem, parseEther, parseUnits } from "viem";
import { useAccount, usePublicClient, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { ActionSuccessModal, type ActionSuccessState } from "@/components/action-success-modal";
// import { MarketLifecycle } from "@/components/market-lifecycle";
import { RuntimeAlerts } from "@/components/runtime-alerts";
import { shieldBetConfig } from "@/lib/contract";
import { formatDeadline, getCountdown, truncateErrorMessage } from "@/lib/format";
import { MarketAsset, MarketCategory } from "@/lib/market-ui";
import { getRuntimeDiagnostics } from "@/lib/runtime-config";
import { logError } from "@/lib/telemetry";

const marketCreatedEvent = parseAbiItem(
  "event MarketCreated(uint256 indexed marketId, string question, uint256 deadline, address indexed creator, uint8 marketType, uint8 assetType, address quoteToken, uint256 minStake)"
);
const marketCategories: MarketCategory[] = ["Crypto", "Politics", "Sports", "Science", "Other"];

export default function CreateMarketPage() {
  const { address } = useAccount();
  const publicClient = usePublicClient();

  const [question, setQuestion] = useState("");
  const [marketType, setMarketType] = useState<0 | 1>(0);
  const [outcomeLabels, setOutcomeLabels] = useState<string[]>(["YES", "NO"]);
  const [category, setCategory] = useState<MarketCategory>("Crypto");
  const [resolutionCriteria, setResolutionCriteria] = useState("");
  const [resolutionSource, setResolutionSource] = useState("");
  const [resolutionPolicy, setResolutionPolicy] = useState("Optimistic oracle notes");
  const [asset, setAsset] = useState<MarketAsset>("ETH");
  const [quoteToken, setQuoteToken] = useState(process.env.NEXT_PUBLIC_USDC_ADDRESS || "");
  const [minStake, setMinStake] = useState("");
  const [closingDate, setClosingDate] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isErrorMessage, setIsErrorMessage] = useState(false);
  const [createdMarketId, setCreatedMarketId] = useState<bigint | null>(null);
  const [successState, setSuccessState] = useState<ActionSuccessState | null>(null);

  const { data: hash, isPending, writeContractAsync } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash });
  const diagnostics = useMemo(() => getRuntimeDiagnostics(), []);

  function addOutcome() {
    setOutcomeLabels((current) => [...current, `Option ${current.length + 1}`]);
  }

  function removeOutcome(index: number) {
    if (outcomeLabels.length <= 2) return;
    setOutcomeLabels((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function updateOutcome(index: number, value: string) {
    setOutcomeLabels((current) => current.map((item, itemIndex) => (itemIndex === index ? value : item)));
  }

  async function onCreate() {
    if (!address) {
      setStatusMessage("Connect your wallet first.");
      setIsErrorMessage(true);
      return;
    }

    if (!question.trim() || !closingDate || !resolutionCriteria.trim()) {
      setStatusMessage("All fields are required.");
      setIsErrorMessage(true);
      return;
    }

    if (outcomeLabels.some((label) => !label.trim())) {
      setStatusMessage("Every outcome label needs a value.");
      setIsErrorMessage(true);
      return;
    }

    let parsedMinStake: bigint;
    try {
      parsedMinStake = minStake.trim()
        ? asset === "ETH"
          ? parseEther(minStake.trim())
          : parseUnits(minStake.trim(), 6)
        : 0n;
    } catch (error) {
      setStatusMessage("Invalid numeric value for min stake. Use decimals like 0.1 ETH or 50 USDC.");
      setIsErrorMessage(true);
      return;
    }

    if (parsedMinStake < 0n) {
      setStatusMessage("Min stake must be >= 0.");
      setIsErrorMessage(true);
      return;
    }

    const deadline = Math.floor(new Date(closingDate).getTime() / 1000);
    if (!Number.isFinite(deadline) || deadline <= Math.floor(Date.now() / 1000)) {
      setStatusMessage("Closing date must be in the future.");
      setIsErrorMessage(true);
      return;
    }

    try {
      setStatusMessage("Creating market on-chain...");
      setIsErrorMessage(false);
      setIsErrorMessage(false);

      if (asset === "USDC" && !quoteToken.trim()) {
        throw new Error("USDC markets require a token address.");
      }

      const txHash = await writeContractAsync({
        ...shieldBetConfig,
        functionName: "createMarketWithMetadata",
        args: [
          question.trim(),
          BigInt(deadline),
          marketType,
          outcomeLabels.map((item) => item.trim()),
          category,
          resolutionCriteria.trim(),
          resolutionSource.trim(),
          resolutionPolicy.trim(),
          asset === "USDC" ? 1 : 0,
          asset === "USDC" ? (quoteToken as `0x${string}`) : "0x0000000000000000000000000000000000000000",
          parsedMinStake
        ],
        value: 0n
      });

      const receipt = await publicClient?.waitForTransactionReceipt({ hash: txHash });
      if (!receipt) throw new Error("Could not confirm transaction");

      let marketId: bigint | null = null;
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({ abi: [marketCreatedEvent], data: log.data, topics: log.topics });
          if (decoded.args.marketId) {
            marketId = decoded.args.marketId;
            break;
          }
        } catch {
          continue;
        }
      }

      if (!marketId) throw new Error("Failed to resolve market ID from logs.");
      setCreatedMarketId(marketId);
      setStatusMessage("Market created successfully.");
      setIsErrorMessage(false);
      setSuccessState({
        title: "Market created successfully",
        description: "Your market is now live and ready for betting. The next step is to open it, review the market state, and share it with participants.",
        txHash,
        secondaryAction: {
          label: "Open Markets",
          href: "/markets",
          variant: "secondary"
        },
        primaryAction: {
          label: "View Market",
          href: `/markets/${marketId.toString()}`
        }
      });
    } catch (error) {
      logError("create-market", "failed", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to create market";
      setStatusMessage(truncateErrorMessage(errorMessage));
      setIsErrorMessage(true);
    }
  }

  return (
    <section className="vm-page page-enter">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <ActionSuccessModal open={Boolean(successState)} state={successState} onClose={() => setSuccessState(null)} />
        <div className="text-center">
          <div className="vm-page-eyebrow mx-auto">
            <Plus className="h-3.5 w-3.5" />
            Market Creation Portal
          </div>
          <h1 className="vm-page-title mt-5">
            Launch Your <span className="vm-text-gradient">Prediction</span>
          </h1>
          <p className="vm-page-subtitle mx-auto mt-4">
            Create a clear market, choose the stake asset, set the market rules, and launch it into the full optimistic oracle lifecycle.
          </p>
        </div>

        <RuntimeAlerts diagnostics={diagnostics} />

        <div className="vm-card overflow-hidden p-6 md:p-8 lg:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-6">
              <div>
                <label className="vm-field-label">
                  <FileText className="h-3.5 w-3.5 text-[var(--primary)]" />
                  Primary Question
                </label>
                <textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  rows={3}
                  className="vm-textarea min-h-[8rem]"
                  placeholder="Will ETH trade above $6,000 by December 31, 2026?"
                />
                <p className="vm-note mt-2">Keep the question specific and objectively resolvable.</p>
              </div>

              <div>
                <label className="vm-field-label">
                  <Tag className="h-3.5 w-3.5 text-[var(--primary)]" />
                  Market Type
                </label>
                <div className="grid gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMarketType(0);
                      setOutcomeLabels(["YES", "NO"]);
                    }}
                    className={`vm-soft-btn justify-center py-4 transition-all duration-200 ${marketType === 0
                        ? "border-[var(--primary)] bg-[var(--primary)]/15 text-[var(--primary)] shadow-lg shadow-[var(--primary)]/20 ring-2 ring-[var(--primary)]/30"
                        : "border-white/10 bg-white/[0.02] text-white/70 hover:border-white/20 hover:bg-white/[0.05] hover:text-white"
                      }`}
                  >
                    {marketType === 0 && <Check className="h-4 w-4 mr-2" />}
                    Binary
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMarketType(1);
                      setOutcomeLabels(["Option 1", "Option 2"]);
                    }}
                    className={`vm-soft-btn justify-center py-4 transition-all duration-200 ${marketType === 1
                        ? "border-[var(--primary)] bg-[var(--primary)]/15 text-[var(--primary)] shadow-lg shadow-[var(--primary)]/20 ring-2 ring-[var(--primary)]/30"
                        : "border-white/10 bg-white/[0.02] text-white/70 hover:border-white/20 hover:bg-white/[0.05] hover:text-white"
                      }`}
                  >
                    {marketType === 1 && <Check className="h-4 w-4 mr-2" />}
                    Categorical
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="vm-field-label mb-0">Outcome Labels</label>
                  {marketType === 1 ? (
                    <button
                      type="button"
                      onClick={addOutcome}
                      className="text-[11px]! font-bold uppercase tracking-[0.18em] text-[var(--primary)] transition hover:opacity-80"
                    >
                      Add option
                    </button>
                  ) : null}
                </div>
                <div className="mt-3 grid gap-3">
                  {outcomeLabels.map((label, index) => (
                    <div key={`outcome-${index}`} className="flex gap-3">
                      <input
                        value={label}
                        onChange={(event) => updateOutcome(index, event.target.value)}
                        readOnly={marketType === 0}
                        className="vm-input"
                      />
                      {marketType === 1 && outcomeLabels.length > 2 ? (
                        <button type="button" onClick={() => removeOutcome(index)} className="vm-icon-btn shrink-0">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className="vm-field-label">
                    <Tag className="h-3.5 w-3.5 text-[var(--primary)]" />
                    Category
                  </label>
                  <select value={category} onChange={(event) => setCategory(event.target.value as MarketCategory)} className="vm-select">
                    {marketCategories.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="vm-field-label">
                    <Calendar className="h-3.5 w-3.5 text-[var(--primary)]" />
                    Closing Date
                  </label>
                  <input
                    type="datetime-local"
                    value={closingDate}
                    onChange={(event) => setClosingDate(event.target.value)}
                    className="vm-input"
                  />
                </div>
              </div>

              <div>
                <label className="vm-field-label">Resolution Criteria</label>
                <textarea
                  value={resolutionCriteria}
                  onChange={(event) => setResolutionCriteria(event.target.value)}
                  className="vm-textarea"
                  placeholder="Describe exactly how this market resolves, what timestamp matters, and which sources are authoritative."
                />
              </div>

              <div>
                <label className="vm-field-label">Resolution Source</label>
                <input
                  value={resolutionSource}
                  onChange={(event) => setResolutionSource(event.target.value)}
                  className="vm-input"
                  placeholder="Lit-assisted oracle notes"
                />
              </div>

              <div>
                <label className="vm-field-label">
                  <ShieldCheck className="h-3.5 w-3.5 text-[var(--primary)]" />
                  Resolution Policy
                </label>
                <input
                  value={resolutionPolicy}
                  onChange={(event) => setResolutionPolicy(event.target.value)}
                  className="vm-input text-gray-400!"
                  placeholder="Optimistic oracle"
                  disabled
                />
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className="vm-field-label">
                    <Coins className="h-3.5 w-3.5 text-[var(--primary)]" />
                    Quote Asset
                  </label>
                  <div className="grid gap-3 md:grid-cols-2">
                    {(["ETH", "USDC"] as MarketAsset[]).map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setAsset(option)}
                        className={`vm-soft-btn justify-center py-4 transition-all duration-200 ${asset === option
                            ? "border-[var(--primary)] bg-[var(--primary)]/15 text-[var(--primary)] shadow-lg shadow-[var(--primary)]/20 ring-2 ring-[var(--primary)]/30"
                            : "border-white/10 bg-white/[0.02] text-white/70 hover:border-white/20 hover:bg-white/[0.05] hover:text-white"
                          }`}
                      >
                        {asset === option && <Check className="h-4 w-4 mr-2" />}
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="vm-field-label">Minimum Stake</label>
                  <input
                    value={minStake}
                    onChange={(event) => setMinStake(event.target.value)}
                    className="vm-input"
                    placeholder={asset === "ETH" ? "0.005" : "1"}
                  />
                  <p className="vm-note mt-2">
                    Enter in human units: ETH (e.g., 0.1) or USDC (e.g., 50). Values are converted to wei/base units for on-chain submission.
                  </p>
                </div>
              </div>

              {asset === "USDC" ? (
                <div>
                  <label className="vm-field-label">USDC Token Address</label>
                  <input
                    value={quoteToken}
                    onChange={(event) => setQuoteToken(event.target.value)}
                    className="vm-input text-gray-400!"
                    placeholder="0x..."
                    disabled
                  />
                </div>
              ) : null}

            </div>

            <div className="space-y-5">
              <div className="rounded-[1.75rem] border border-white/6 bg-white/[0.03] p-6">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--primary)]">Review</div>
                <div className="mt-5 space-y-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Question</div>
                    <div className="mt-2 text-sm font-semibold text-white/90">{question || "Your market question will appear here."}</div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Type</div>
                      <div className="mt-2 text-sm text-white/82">{marketType === 0 ? "Binary" : "Categorical"}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Category</div>
                      <div className="mt-2 text-sm text-white/82">{category}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Accepted Token</div>
                      <div className="mt-2 text-sm text-white/82">{asset}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Settlement Model</div>
                      <div className="mt-2 text-sm text-white/82">{resolutionPolicy || "Optimistic oracle with admin fallback"}</div>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Outcomes</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {outcomeLabels.map((label) => (
                        <span key={label} className="vm-category-pill border-white/8 bg-white/4 text-white/72">
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Resolution Source</div>
                    <div className="mt-2 text-sm text-white/82">{resolutionSource || "Not provided"}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Min Stake</div>
                    <div className="mt-2 text-sm text-white/82">{minStake || "0"}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-[1.75rem] border border-[var(--primary)]/14 bg-[var(--primary)]/7 p-6">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--primary)]">Execution Model</div>
                <ul className="mt-4 space-y-3 text-sm leading-7 text-white/72">
                  <li>Each market can settle in ETH or USDC.</li>
                  <li>Outcome selection is encrypted before submission via Zama tooling.</li>
                  <li>Winner payouts come only from the actual public stake pool; there is no extra seeded liquidity layer.</li>
                  <li>Resolution follows an optimistic oracle flow with proposal, challenge, and automatic or admin finalization paths.</li>
                </ul>
              </div>

              <div className="rounded-[1.75rem] border border-white/6 bg-white/[0.03] p-6">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--primary)]">Lifecycle Preview</div>
                <p className="mt-3 text-sm leading-7 text-white/68">
                  Every market you create will move through the same lifecycle before claims become available.
                </p>
                {/* <div className="mt-5">
                  <MarketLifecycle currentStatus="Active" compact />
                </div> */}
              </div>

              <button
                type="button"
                onClick={onCreate}
                disabled={isPending || isConfirming}
                className="vm-primary-btn w-full disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending || isConfirming ? "Creating market..." : "Create Market"}
              </button>

              {statusMessage ? (
                <div className={`rounded-[1.25rem] border p-4 text-sm leading-7 ${isErrorMessage
                  ? "border-red-400/20 bg-red-400/10 text-red-300"
                  : "border-white/6 bg-white/[0.03] text-white/72"
                  }`}>
                  {statusMessage}
                </div>
              ) : null}

              {createdMarketId ? (
                <div className="rounded-[1.75rem] border border-[var(--primary)]/18 bg-[var(--primary)]/8 p-6 text-center">
                  <div className="font-display text-xl font-bold text-white">Latest market</div>
                  <p className="mt-2 text-sm leading-7 text-white/68">
                    Market #{createdMarketId.toString()} was created from this session.
                  </p>
                  <div className="mt-5 flex justify-center">
                    <Link href={`/markets/${createdMarketId}`} className="vm-secondary-btn">
                      Open Market
                    </Link>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
