"use client";

import Link from "next/link";

export interface MyBetRow {
  marketId: bigint;
  question: string;
  position: "YES" | "NO" | "Encrypted";
  status: "Open" | "Resolved" | "Claimed";
  canClaim: boolean;
}

interface MyBetsTableProps {
  rows: MyBetRow[];
}

export function MyBetsTable({ rows }: MyBetsTableProps) {
  if (!rows.length) {
    return (
      <div className="surface p-8 text-center">
        <h2 className="section-title mb-2">No confidential bets yet</h2>
        <p className="subtle mb-4">Explore markets and place your first encrypted position.</p>
        <Link
          href="/markets"
          className="inline-flex rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:scale-[1.02] hover:bg-indigo-600"
        >
          Explore markets
        </Link>
      </div>
    );
  }

  return (
    <div className="surface overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-900 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Market</th>
              <th className="px-4 py-3">Your Position</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.marketId.toString()} className="border-t border-slate-200 dark:border-slate-800">
                <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{row.question}</td>
                <td className="px-4 py-3">{row.position}</td>
                <td className="px-4 py-3">●●●●●● encrypted</td>
                <td className="px-4 py-3">{row.status}</td>
                <td className="px-4 py-3">
                  {row.canClaim ? (
                    <Link
                      href={`/markets/${row.marketId}`}
                      className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Claim winnings
                    </Link>
                  ) : (
                    <Link
                      href={`/markets/${row.marketId}`}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold dark:border-slate-700"
                    >
                      View
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
