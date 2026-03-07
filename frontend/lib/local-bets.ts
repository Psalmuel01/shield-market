export type LocalBetPosition = "YES" | "NO";

export interface LocalBetRecord {
  marketId: string;
  wallet: string;
  position: LocalBetPosition;
  amountWei: string;
  createdAt: number;
}

const KEY = "shieldbet-local-bets";

function safeParse(raw: string | null): LocalBetRecord[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as LocalBetRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readAll(): LocalBetRecord[] {
  if (typeof window === "undefined") return [];
  return safeParse(window.localStorage.getItem(KEY));
}

function writeAll(records: LocalBetRecord[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(records));
}

export function saveLocalBet(record: LocalBetRecord) {
  const records = readAll();
  const next = records.filter((item) => !(item.marketId === record.marketId && item.wallet === record.wallet));
  next.push(record);
  writeAll(next);
}

export function getLocalBet(marketId: bigint, wallet?: string): LocalBetRecord | null {
  if (!wallet) return null;
  const target = wallet.toLowerCase();
  const targetMarket = marketId.toString();

  return (
    readAll().find((item) => item.marketId === targetMarket && item.wallet.toLowerCase() === target) ?? null
  );
}

export function getLocalBetsByWallet(wallet?: string): LocalBetRecord[] {
  if (!wallet) return [];
  const target = wallet.toLowerCase();
  return readAll().filter((item) => item.wallet.toLowerCase() === target);
}
