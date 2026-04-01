"use client";

import { Lock, Shield } from "lucide-react";
import { EncryptedBands } from "@/components/encrypted-bands";

interface EncryptedActivityProps {
  marketId: bigint;
}

export function EncryptedActivity({ marketId }: EncryptedActivityProps) {
  const bands = Number((marketId % 8n) + 3n);

  return (
    <div className="surface p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="section-title text-base!">Encrypted Activity</h3>
        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
          <Shield className="h-3.5 w-3.5" /> Confidential
        </span>
      </div>

      <div className="surface-muted flex items-center justify-between px-4 py-2">
        <div>
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Public activity is hidden</p>
          <p className="subtle text-xs! mt-1">v1 shows privacy bands only. Exact timing and sizes remain hidden until settlement.</p>
        </div>
        <div className="flex items-center gap-2">
          <EncryptedBands count={bands} />
          <Lock className="h-4 w-4 text-indigo-500" />
        </div>
      </div>

      <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">All activity is confidential until settlement.</p>
    </div>
  );
}
