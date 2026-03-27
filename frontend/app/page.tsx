import Link from "next/link";
import { ArrowRight, Lock, Shield } from "lucide-react";

export default function Home() {
  return (
    <section className="space-y-6">
      <div className="surface overflow-hidden p-8 md:p-12">
        <div className="max-w-3xl">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
            <Shield className="h-3.5 w-3.5" /> Confidential Markets
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 md:text-5xl">
            Prediction markets with encrypted side selection.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-slate-600 dark:text-slate-300 md:text-lg">
            ShieldBet v1 keeps your YES or NO side encrypted on-chain while ETH stakes stay public for clean settlement.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/markets"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:scale-[1.02] hover:bg-indigo-600"
            >
              Enter markets <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/create"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:scale-[1.02] dark:border-slate-700 dark:text-slate-200"
            >
              <Lock className="h-4 w-4" /> Create market
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
