"use client";

import Link from "next/link";
export interface MyBetRow {
  marketId: bigint;
  question: string;
  position: string;
  amountLabel: string;
  status:
    | "Open"
    | "Awaiting Resolution"
    | "Awaiting Payout"
    | "Won"
    | "Lost"
    | "Proposed"
    | "Disputed"
    | "Finalized"
    | "Claimed"
    | "Cancelled";
  canClaim: boolean;
  claimType?: "winnings" | "refund";
}

interface MyBetsTableProps {
  rows: MyBetRow[];
}

function statusClass(status: MyBetRow["status"]) {
  if (status === "Won" || status === "Claimed") return "border-emerald-400/20 bg-emerald-400/10 text-emerald-300";
  if (status === "Disputed") return "border-rose-400/20 bg-rose-400/10 text-rose-300";
  if (status === "Open" || status === "Awaiting Resolution") return "border-blue-400/20 bg-blue-400/10 text-blue-300";
  if (status === "Proposed") return "border-amber-400/20 bg-amber-400/10 text-amber-300";
  return "border-white/10 bg-white/6 text-white/72";
}

export function MyBetsTable({ rows }: MyBetsTableProps) {
  if (!rows.length) {
    return (
      <div className="vm-card p-16 text-center">
        <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full border border-white/6 bg-white/[0.03] text-2xl">
          🗳️
        </div>
        <h2 className="font-display mt-6 text-2xl font-bold text-white">No positions yet</h2>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-7 text-white/55">
          You have not placed a confidential position yet. Explore the live market board and take your first side.
        </p>
        <div className="mt-6">
          <Link href="/markets" className="vm-primary-btn inline-flex">
            Explore Markets
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="vm-card overflow-hidden">
      <div className="vm-table-wrap">
        <table className="vm-table">
          <thead>
            <tr>
              <th>Market</th>
              <th>Your Position</th>
              <th>Stake</th>
              <th>Status</th>
              <th className="text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.marketId.toString()}>
                <td className="max-w-md">
                  <Link
                    href={`/markets/${row.marketId}`}
                    className="line-clamp-2 text-sm font-semibold text-white transition hover:text-[var(--primary)]"
                  >
                    {row.question}
                  </Link>
                  <div className="mt-2 text-[10px] uppercase tracking-[0.18em] text-white/35">Market #{row.marketId.toString()}</div>
                </td>
                <td>
                  <span
                    className={`inline-flex rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] ${
                      row.position === "Decrypting..."
                        ? "border-white/10 bg-white/6 text-white/55"
                        : "border-[var(--primary)]/20 bg-[var(--primary)]/10 text-[var(--primary)]"
                    }`}
                  >
                    {row.position}
                  </span>
                </td>
                <td className="font-mono text-sm font-bold text-white">{row.amountLabel}</td>
                <td>
                  <span className={`inline-flex rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] ${statusClass(row.status)}`}>
                    {row.status}
                  </span>
                </td>
                <td className="text-right">
                  <Link href={`/markets/${row.marketId}`} className={row.canClaim ? "vm-primary-btn inline-flex min-h-0 px-4 py-2" : "vm-secondary-btn inline-flex min-h-0 px-4 py-2"}>
                    {row.canClaim ? (row.claimType === "refund" ? "Claim Refund" : "Claim") : "View"}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
