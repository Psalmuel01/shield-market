interface EncryptedBandsProps {
  count: number;
  className?: string;
}

export function EncryptedBands({ count, className }: EncryptedBandsProps) {
  const dots = Array.from({ length: Math.max(1, Math.min(10, count)) });

  return (
    <div className={`inline-flex items-center gap-1 ${className || ""}`}>
      {dots.map((_, index) => (
        <span
          key={index}
          className="inline-block h-2 w-2 rounded-full bg-slate-500/70 dark:bg-slate-300/70"
          aria-hidden
        />
      ))}
    </div>
  );
}
