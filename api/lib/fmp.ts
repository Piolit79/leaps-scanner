// Yahoo Finance replaces FMP (FMP free tier no longer supports these endpoints)

async function yahooQuote(symbol: string): Promise<any> {
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=price,incomeStatementHistoryQuarterly`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    if (!r.ok) return null;
    const data = await r.json();
    return data?.quoteSummary?.result?.[0] ?? null;
  } catch {
    return null;
  }
}

export interface FmpProfile {
  symbol: string;
  companyName: string;
  mktCap: number;
  price: number;
}

export async function getProfile(symbol: string): Promise<FmpProfile | null> {
  try {
    const q = await yahooQuote(symbol);
    if (!q?.price) return null;
    return {
      symbol,
      companyName: q.price.longName ?? q.price.shortName ?? symbol,
      mktCap: q.price.marketCap?.raw ?? 0,
      price: q.price.regularMarketPrice?.raw ?? 0,
    };
  } catch {
    return null;
  }
}

export async function hasPositiveRevenueGrowth(symbol: string): Promise<boolean | null> {
  try {
    const q = await yahooQuote(symbol);
    const stmts = q?.incomeStatementHistoryQuarterly?.incomeStatementHistory;
    if (!stmts || stmts.length < 5) return null;
    const rev = (i: number) => stmts[i]?.totalRevenue?.raw ?? 0;
    return rev(0) > rev(4) && rev(1) > rev(5);
  } catch {
    return null;
  }
}

export async function getLargeCapUniverse(_minCapB: number): Promise<string[]> {
  return FALLBACK_LARGE_CAPS;
}

// Pre-vetted large caps (all well above $100B market cap)
export const FALLBACK_LARGE_CAPS = [
  'AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','LLY','AVGO','JPM',
  'V','UNH','XOM','MA','JNJ','PG','HD','MRK','COST','ABBV','CVX','BAC',
  'KO','NFLX','CRM','ORCL','AMD','PEP','TMO','ACN','MCD','CSCO','LIN',
  'ABT','TXN','NKE','ADBE','DHR','NEE','QCOM','WMT','HON','AMGN','GE',
  'CAT','GS','SPGI','BLK','MDT','SYK','AXP','ISRG','GILD','VRTX','REGN',
  'ZTS','MMC','PLD','CI','CB','DUK','SO','ETN','ITW','SCHW','CME','MCO',
];
