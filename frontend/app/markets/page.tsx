import { Lock } from "lucide-react";
import { MarketsDashboard } from "@/components/markets-dashboard";

export default function MarketsPage() {
  return (
    <section className="space-y-5">
      <div className="surface overflow-hidden p-6 md:p-8">
        <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
          <Lock className="h-3.5 w-3.5" /> Markets
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 md:text-4xl">
          Prediction markets with encrypted side selection.
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-600 dark:text-slate-300 md:text-base">
          ShieldBet v1 keeps your YES or NO side encrypted on-chain while ETH stakes remain public for honest settlement.
        </p>
      </div>

      <MarketsDashboard />
    </section>
  );
}
