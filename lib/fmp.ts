const BASE = 'https://financialmodelingprep.com/api/v3';

async function get(path: string) {
  const key = process.env.FMP_API_KEY;
  if (!key) return null;
  const r = await fetch(`${BASE}${path}&apikey=${key}`);
  if (!r.ok) return null;
  return r.json();
}

export interface FmpProfile {
  symbol: string;
  companyName: string;
  mktCap: number; // in USD
  price: number;
}

// Returns market cap in billions and company name
export async function getProfile(symbol: string): Promise<FmpProfile | null> {
  try {
    const data = await get(`/profile/${symbol}?`);
    return data?.[0] ?? null;
  } catch {
    return null;
  }
}

// Returns true if YoY revenue growth was positive in each of the last 2 quarters
export async function hasPositiveRevenueGrowth(symbol: string): Promise<boolean | null> {
  try {
    const data = await get(`/income-statement/${symbol}?period=quarter&limit=6`);
    if (!data || data.length < 5) return null;

    // Compare q[0] vs q[4] and q[1] vs q[5] (same quarter a year ago)
    const q0Growth = data[0].revenue > data[4].revenue;
    const q1Growth = data[1].revenue > data[5].revenue;
    return q0Growth && q1Growth;
  } catch {
    return null;
  }
}

// Get large-cap universe (market cap >= minCapB billion)
// Uses S&P 500 list and filters by market cap
export async function getLargeCapUniverse(minCapB: number): Promise<string[]> {
  try {
    const data = await get(`/sp500_constituent?`);
    if (!data) return FALLBACK_LARGE_CAPS;
    return (data as Array<{ symbol: string }>).map(s => s.symbol);
  } catch {
    return FALLBACK_LARGE_CAPS;
  }
}

// Fallback large-cap list if FMP unavailable
export const FALLBACK_LARGE_CAPS = [
  'AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','BRK.B','LLY','AVGO',
  'JPM','V','UNH','XOM','MA','JNJ','PG','HD','MRK','COST','ABBV','CVX',
  'BAC','KO','NFLX','CRM','ORCL','AMD','PEP','TMO','ACN','MCD','CSCO',
  'LIN','ABT','TXN','NKE','ADBE','DHR','NEE','QCOM','WMT','RTX','HON',
  'UPS','IBM','AMGN','GE','CAT','GS','SPGI','BLK','ELV','MDT','SYK','AXP',
  'ISRG','GILD','VRTX','REGN','ZTS','MMC','PLD','CI','CB','MO','DUK',
  'SO','ETN','ITW','SCHW','AON','CME','MCO','FIS','TJX','USB','WFC','C',
];
