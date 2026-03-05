const BASE = 'https://data.alpaca.markets';
const PAPER = 'https://paper-api.alpaca.markets';

function headers() {
  return {
    'APCA-API-KEY-ID': process.env.ALPACA_API_KEY!,
    'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET!,
    'Content-Type': 'application/json',
  };
}

async function get(url: string) {
  const r = await fetch(url, { headers: headers() });
  if (!r.ok) throw new Error(`Alpaca ${r.status}: ${url} — ${await r.text()}`);
  return r.json();
}

// Daily stock bars (limit days back)
export async function getStockBars(symbol: string, days = 260): Promise<Bar[]> {
  const start = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const url = `${BASE}/v2/stocks/${symbol}/bars?timeframe=1Day&start=${start}&limit=1000&adjustment=split`;
  const data = await get(url);
  return (data.bars || []) as Bar[];
}

// Latest quote for a stock
export async function getStockSnapshot(symbol: string): Promise<StockSnapshot> {
  const url = `${BASE}/v2/stocks/${symbol}/snapshot`;
  return get(url);
}

// Options chain for a symbol — calls only, filtered by DTE range and optional strike bounds
export async function getOptionsChain(
  symbol: string,
  minDte: number,
  maxDte: number,
  strikeLow?: number,
  strikeHigh?: number,
): Promise<OptionContract[]> {
  const today = new Date();
  const minExp = new Date(today.getTime() + minDte * 86400000).toISOString().slice(0, 10);
  const maxExp = new Date(today.getTime() + maxDte * 86400000).toISOString().slice(0, 10);

  let url = `${PAPER}/v2/options/contracts?underlying_symbols=${symbol}&type=call&expiration_date_gte=${minExp}&expiration_date_lte=${maxExp}&status=active&limit=200`;
  if (strikeLow)  url += `&strike_price_gte=${strikeLow.toFixed(2)}`;
  if (strikeHigh) url += `&strike_price_lte=${strikeHigh.toFixed(2)}`;
  const data = await get(url);
  return (data.option_contracts || []) as OptionContract[];
}

// Current snapshot for a specific option contract (price, greeks, IV, OI)
export async function getOptionSnapshot(contractSymbol: string): Promise<OptionSnapshot | null> {
  try {
    const url = `${BASE}/v2/options/snapshots/${contractSymbol}`;
    const data = await get(url);
    return data[contractSymbol] ?? null;
  } catch {
    return null;
  }
}

// Historical daily bars for an option contract (to find all-time low)
export async function getOptionBars(contractSymbol: string): Promise<Bar[]> {
  try {
    const url = `${BASE}/v2/options/bars?symbols=${contractSymbol}&timeframe=1Day&limit=1000`;
    const data = await get(url);
    return (data.bars?.[contractSymbol] || []) as Bar[];
  } catch {
    return [];
  }
}

// Batch snapshots for multiple option contracts
export async function getOptionSnapshots(symbols: string[]): Promise<Record<string, OptionSnapshot>> {
  if (symbols.length === 0) return {};
  const chunks: string[][] = [];
  for (let i = 0; i < symbols.length; i += 50) chunks.push(symbols.slice(i, i + 50));
  const results: Record<string, OptionSnapshot> = {};
  for (const chunk of chunks) {
    const url = `${BASE}/v2/options/snapshots?symbols=${chunk.join(',')}&feed=indicative`;
    try {
      const data = await get(url);
      Object.assign(results, data.snapshots ?? data);
    } catch {}
  }
  return results;
}

export interface Bar {
  t: string; // timestamp
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface StockSnapshot {
  latestTrade?: { p: number };
  latestQuote?: { ap: number; bp: number };
  dailyBar?: { o: number; h: number; l: number; c: number; v: number };
  prevDailyBar?: { c: number };
}

export interface OptionContract {
  symbol: string;
  underlying_symbol: string;
  type: string;
  strike_price: number;
  expiration_date: string;
  open_interest: number;
  size: number;
}

export interface OptionSnapshot {
  greeks?: { delta: number; gamma: number; theta: number; vega: number };
  impliedVolatility?: number;
  latestQuote?: { ap: number; bp: number; ax: number; bx: number };
  latestTrade?: { p: number };
  openInterest?: number;
}
