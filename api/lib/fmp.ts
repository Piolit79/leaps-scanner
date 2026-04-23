// Static universe of large-cap US common stocks (market cap > $10B).
// Storing name + approx market cap here eliminates per-stock Yahoo Finance calls,
// which was the main bottleneck when scanning more than ~70 stocks.

export interface FmpProfile {
  symbol: string;
  companyName: string;
  mktCap: number;
  price: number;
}

export interface StockMeta {
  name: string;
  capB: number; // approximate market cap in billions
}

export const STOCK_META: Record<string, StockMeta> = {
  // ── Mega-cap Tech ──────────────────────────────────────────────────────────
  AAPL:  { name: 'Apple',                    capB: 3200 },
  MSFT:  { name: 'Microsoft',                capB: 3100 },
  NVDA:  { name: 'NVIDIA',                   capB: 3000 },
  AMZN:  { name: 'Amazon',                   capB: 2000 },
  GOOGL: { name: 'Alphabet',                 capB: 2000 },
  META:  { name: 'Meta Platforms',           capB: 1400 },
  TSLA:  { name: 'Tesla',                    capB:  800 },
  AVGO:  { name: 'Broadcom',                 capB:  750 },
  // ── Software & Semiconductors ─────────────────────────────────────────────
  ORCL:  { name: 'Oracle',                   capB:  420 },
  CRM:   { name: 'Salesforce',               capB:  300 },
  NOW:   { name: 'ServiceNow',               capB:  200 },
  INTU:  { name: 'Intuit',                   capB:  180 },
  ADBE:  { name: 'Adobe',                    capB:  200 },
  AMD:   { name: 'Advanced Micro Devices',   capB:  250 },
  QCOM:  { name: 'Qualcomm',                 capB:  180 },
  TXN:   { name: 'Texas Instruments',        capB:  175 },
  AMAT:  { name: 'Applied Materials',        capB:  190 },
  MU:    { name: 'Micron Technology',        capB:  130 },
  KLAC:  { name: 'KLA Corp',                 capB:  105 },
  LRCX:  { name: 'Lam Research',             capB:   95 },
  SNPS:  { name: 'Synopsys',                 capB:   90 },
  CDNS:  { name: 'Cadence Design Systems',   capB:   85 },
  CSCO:  { name: 'Cisco Systems',            capB:  200 },
  INTC:  { name: 'Intel',                    capB:  140 },
  IBM:   { name: 'IBM',                      capB:  200 },
  PANW:  { name: 'Palo Alto Networks',       capB:  120 },
  FTNT:  { name: 'Fortinet',                 capB:   60 },
  ACN:   { name: 'Accenture',                capB:  220 },
  // ── Financials ────────────────────────────────────────────────────────────
  JPM:   { name: 'JPMorgan Chase',           capB:  600 },
  BAC:   { name: 'Bank of America',          capB:  300 },
  WFC:   { name: 'Wells Fargo',              capB:  200 },
  GS:    { name: 'Goldman Sachs',            capB:  160 },
  MS:    { name: 'Morgan Stanley',           capB:  150 },
  C:     { name: 'Citigroup',                capB:  120 },
  USB:   { name: 'US Bancorp',               capB:   65 },
  PNC:   { name: 'PNC Financial',            capB:   65 },
  TFC:   { name: 'Truist Financial',         capB:   55 },
  COF:   { name: 'Capital One',              capB:   65 },
  V:     { name: 'Visa',                     capB:  550 },
  MA:    { name: 'Mastercard',               capB:  450 },
  AXP:   { name: 'American Express',         capB:  180 },
  SCHW:  { name: 'Charles Schwab',           capB:  130 },
  BLK:   { name: 'BlackRock',                capB:  130 },
  SPGI:  { name: 'S&P Global',               capB:  130 },
  CME:   { name: 'CME Group',                capB:   80 },
  MCO:   { name: "Moody's",                  capB:   80 },
  ICE:   { name: 'Intercontinental Exchange',capB:   80 },
  MMC:   { name: 'Marsh McLennan',           capB:   95 },
  CB:    { name: 'Chubb',                    capB:   90 },
  MET:   { name: 'MetLife',                  capB:   55 },
  PRU:   { name: 'Prudential Financial',     capB:   40 },
  AFL:   { name: 'Aflac',                    capB:   55 },
  // ── Healthcare ────────────────────────────────────────────────────────────
  UNH:   { name: 'UnitedHealth Group',       capB:  500 },
  LLY:   { name: 'Eli Lilly',                capB:  700 },
  JNJ:   { name: 'Johnson & Johnson',        capB:  400 },
  MRK:   { name: 'Merck',                    capB:  300 },
  ABBV:  { name: 'AbbVie',                   capB:  290 },
  PFE:   { name: 'Pfizer',                   capB:  145 },
  BMY:   { name: 'Bristol-Myers Squibb',     capB:  130 },
  TMO:   { name: 'Thermo Fisher Scientific', capB:  220 },
  ABT:   { name: 'Abbott Laboratories',      capB:  185 },
  DHR:   { name: 'Danaher',                  capB:  155 },
  MDT:   { name: 'Medtronic',                capB:  120 },
  SYK:   { name: 'Stryker',                  capB:  120 },
  ISRG:  { name: 'Intuitive Surgical',       capB:  180 },
  BSX:   { name: 'Boston Scientific',        capB:   75 },
  AMGN:  { name: 'Amgen',                    capB:  150 },
  GILD:  { name: 'Gilead Sciences',          capB:   90 },
  VRTX:  { name: 'Vertex Pharmaceuticals',   capB:  120 },
  REGN:  { name: 'Regeneron Pharmaceuticals',capB:   90 },
  ZTS:   { name: 'Zoetis',                   capB:   80 },
  IQV:   { name: 'IQVIA Holdings',           capB:   45 },
  CI:    { name: 'Cigna',                    capB:   80 },
  ELV:   { name: 'Elevance Health',          capB:   80 },
  HUM:   { name: 'Humana',                   capB:   40 },
  CVS:   { name: 'CVS Health',               capB:   90 },
  MCK:   { name: 'McKesson',                 capB:   70 },
  RMD:   { name: 'ResMed',                   capB:   35 },
  A:     { name: 'Agilent Technologies',     capB:   35 },
  BIIB:  { name: 'Biogen',                   capB:   30 },
  // ── Consumer Staples ─────────────────────────────────────────────────────
  WMT:   { name: 'Walmart',                  capB:  700 },
  COST:  { name: 'Costco',                   capB:  380 },
  PG:    { name: 'Procter & Gamble',         capB:  380 },
  KO:    { name: 'Coca-Cola',                capB:  280 },
  PEP:   { name: 'PepsiCo',                  capB:  200 },
  PM:    { name: 'Philip Morris',            capB:  210 },
  MO:    { name: 'Altria Group',             capB:   80 },
  MDLZ:  { name: 'Mondelez International',   capB:   80 },
  CL:    { name: 'Colgate-Palmolive',        capB:   60 },
  KMB:   { name: 'Kimberly-Clark',           capB:   45 },
  GIS:   { name: 'General Mills',            capB:   35 },
  // ── Consumer Discretionary ───────────────────────────────────────────────
  HD:    { name: 'Home Depot',               capB:  370 },
  MCD:   { name: "McDonald's",               capB:  220 },
  NKE:   { name: 'Nike',                     capB:  120 },
  SBUX:  { name: 'Starbucks',                capB:  100 },
  LOW:   { name: "Lowe's",                   capB:  140 },
  TJX:   { name: 'TJX Companies',            capB:  120 },
  TGT:   { name: 'Target',                   capB:   70 },
  ROST:  { name: 'Ross Stores',              capB:   55 },
  BKNG:  { name: 'Booking Holdings',         capB:  140 },
  MAR:   { name: 'Marriott International',   capB:   65 },
  HLT:   { name: 'Hilton Worldwide',         capB:   55 },
  ABNB:  { name: 'Airbnb',                   capB:   85 },
  GM:    { name: 'General Motors',           capB:   50 },
  F:     { name: 'Ford Motor',               capB:   45 },
  // ── Industrials ───────────────────────────────────────────────────────────
  GE:    { name: 'GE Aerospace',             capB:  180 },
  HON:   { name: 'Honeywell',                capB:  130 },
  CAT:   { name: 'Caterpillar',              capB:  180 },
  ETN:   { name: 'Eaton',                    capB:  130 },
  ITW:   { name: 'Illinois Tool Works',      capB:   80 },
  EMR:   { name: 'Emerson Electric',         capB:   65 },
  PH:    { name: 'Parker Hannifin',          capB:   70 },
  ROK:   { name: 'Rockwell Automation',      capB:   35 },
  RTX:   { name: 'RTX (Raytheon)',           capB:  140 },
  LMT:   { name: 'Lockheed Martin',          capB:  130 },
  NOC:   { name: 'Northrop Grumman',         capB:   70 },
  GD:    { name: 'General Dynamics',         capB:   75 },
  BA:    { name: 'Boeing',                   capB:  120 },
  UPS:   { name: 'UPS',                      capB:  120 },
  FDX:   { name: 'FedEx',                    capB:   65 },
  UNP:   { name: 'Union Pacific',            capB:  145 },
  CSX:   { name: 'CSX',                      capB:   60 },
  NSC:   { name: 'Norfolk Southern',         capB:   60 },
  MMM:   { name: '3M',                       capB:   55 },
  DE:    { name: 'Deere & Company',          capB:  110 },
  // ── Energy ────────────────────────────────────────────────────────────────
  XOM:   { name: 'ExxonMobil',              capB:  520 },
  CVX:   { name: 'Chevron',                  capB:  290 },
  COP:   { name: 'ConocoPhillips',           capB:  120 },
  SLB:   { name: 'SLB (Schlumberger)',       capB:   60 },
  EOG:   { name: 'EOG Resources',            capB:   70 },
  MPC:   { name: 'Marathon Petroleum',       capB:   60 },
  VLO:   { name: 'Valero Energy',            capB:   50 },
  PSX:   { name: 'Phillips 66',              capB:   55 },
  OKE:   { name: 'ONEOK',                    capB:   55 },
  WMB:   { name: 'Williams Companies',       capB:   60 },
  KMI:   { name: 'Kinder Morgan',            capB:   45 },
  // ── Utilities ─────────────────────────────────────────────────────────────
  NEE:   { name: 'NextEra Energy',           capB:  110 },
  DUK:   { name: 'Duke Energy',              capB:   60 },
  SO:    { name: 'Southern Company',         capB:   70 },
  D:     { name: 'Dominion Energy',          capB:   45 },
  AEP:   { name: 'American Electric Power',  capB:   45 },
  EXC:   { name: 'Exelon',                   capB:   40 },
  XEL:   { name: 'Xcel Energy',              capB:   35 },
  // ── Materials ─────────────────────────────────────────────────────────────
  LIN:   { name: 'Linde',                    capB:  220 },
  APD:   { name: 'Air Products',             capB:   70 },
  SHW:   { name: 'Sherwin-Williams',         capB:   90 },
  ECL:   { name: 'Ecolab',                   capB:   60 },
  PPG:   { name: 'PPG Industries',           capB:   35 },
  NUE:   { name: 'Nucor',                    capB:   35 },
  FCX:   { name: 'Freeport-McMoRan',         capB:   60 },
  // ── Communication Services ────────────────────────────────────────────────
  NFLX:  { name: 'Netflix',                  capB:  350 },
  DIS:   { name: 'Walt Disney',              capB:  180 },
  CMCSA: { name: 'Comcast',                  capB:  150 },
  VZ:    { name: 'Verizon',                  capB:  165 },
  T:     { name: 'AT&T',                     capB:  130 },
  TMUS:  { name: 'T-Mobile US',              capB:  250 },
  // ── REITs ─────────────────────────────────────────────────────────────────
  PLD:   { name: 'Prologis',                 capB:  110 },
  AMT:   { name: 'American Tower',           capB:   90 },
  EQIX:  { name: 'Equinix',                  capB:   80 },
  SPG:   { name: 'Simon Property Group',     capB:   70 },
  PSA:   { name: 'Public Storage',           capB:   55 },
  CCI:   { name: 'Crown Castle',             capB:   50 },
};

export const FALLBACK_LARGE_CAPS = Object.keys(STOCK_META);

export async function getProfile(symbol: string): Promise<FmpProfile | null> {
  const meta = STOCK_META[symbol];
  if (meta) {
    return {
      symbol,
      companyName: meta.name,
      mktCap: meta.capB * 1e9,
      price: 0,
    };
  }
  // Fallback to Yahoo Finance for any unlisted symbol
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=price`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } },
    );
    if (!r.ok) return null;
    const data = await r.json();
    const q = data?.quoteSummary?.result?.[0];
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

export async function getLargeCapUniverse(_minCapB: number): Promise<string[]> {
  return FALLBACK_LARGE_CAPS;
}
