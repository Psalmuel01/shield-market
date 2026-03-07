export function formatDeadline(deadline: bigint) {
  const ms = Number(deadline) * 1000;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(ms);
}

export function getCountdown(deadline: bigint) {
  const diff = Number(deadline) * 1000 - Date.now();
  if (diff <= 0) return "Closed";

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h remaining`;

  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m remaining`;
}

export function cidToExplorer(cid: string) {
  if (!cid) return "";
  return `https://cid.ipfs.tech/#${cid}`;
}
