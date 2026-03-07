"use client";

import { Lock, Shield } from "lucide-react";
import { EncryptedBands } from "@/components/encrypted-bands";

interface EncryptedActivityProps {
  marketId: bigint;
}

function relativeStamp(minutesAgo: number) {
  if (minutesAgo < 60) return `${minutesAgo}m ago`;
  const hours = Math.floor(minutesAgo / 60);
  return `${hours}h ago`;
}

export function EncryptedActivity({ marketId }: EncryptedActivityProps) {
  const seed = Number(marketId % 97n);
  const entries = Array.from({ length: 7 }, (_, i) => {
    const minutesAgo = (i + 1) * (seed % 11 + 7);
    const bands = ((seed + i * 3) % 10) + 1;
    return { id: `${marketId}-${i}`, minutesAgo, bands };
  });

  return (
    <div className="surface p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="section-title text-base">Encrypted Activity</h3>
        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
          <Shield className="h-3.5 w-3.5" /> Confidential
        </span>
      </div>

      <div className="space-y-3">
        {entries.map((entry) => (
          <div key={entry.id} className="surface-muted flex items-center justify-between px-3 py-2">
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Encrypted position placed</p>
              <p className="subtle">{relativeStamp(entry.minutesAgo)}</p>
            </div>
            <div className="flex items-center gap-2">
              <EncryptedBands count={entry.bands} />
              <Lock className="h-4 w-4 text-indigo-500" />
            </div>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">All activity is confidential until settlement.</p>
    </div>
  );
}
