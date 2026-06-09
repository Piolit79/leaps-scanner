import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// ── Alpaca helpers (inline to avoid ESM resolution issues) ────────────────────

const ALPACA_BASE = 'https://data.alpaca.markets';

function alpacaHeaders() {
  return {
    'APCA-API-KEY-ID': process.env.ALPACA_API_KEY!,
    'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET!,
    'Content-Type': 'application/json',
  };
}

async function alpacaGet(url: string) {
  const r = await fetch(url, { headers: alpacaHeaders() });
  if (!r.ok) throw new Error(`Alpaca ${r.status}: ${await r.text()}`);
  return r.json() as Promise<any>;
}

async function getStockBars(symbol: string, days = 400) {
  const start = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const url = `${ALPACA_BASE}/v2/stocks/${symbol}/bars?timeframe=1Day&start=${start}&limit=1000&adjustment=split&feed=iex`;
  const data = await alpacaGet(url);
  return (data.bars || []) as Array<{ t: string; o: number; h: number; l: number; c: number; v: number }>;
}

async function getStockSnapshot(symbol: string) {
  const url = `${ALPACA_BASE}/v2/stocks/${symbol}/snapshot?feed=iex`;
  return alpacaGet(url) as Promise<{
    latestTrade?: { p: number };
    latestQuote?: { ap: number; bp: number };
    dailyBar?: { o: number; h: number; l: number; c: number; v: number };
    prevDailyBar?: { c: number };
  }>;
}

async function getOptionSnapshots(symbols: string[]) {
  if (symbols.length === 0) return {} as Record<string, any>;
  const chunks: string[][] = [];
  for (let i = 0; i < symbols.length; i += 50) chunks.push(symbols.slice(i, i + 50));
  const results: Record<string, any> = {};
  for (const chunk of chunks) {
    const url = `${ALPACA_BASE}/v1beta1/options/snapshots?symbols=${chunk.join(',')}&feed=indicative`;
    try {
      const data = await alpacaGet(url);
      Object.assign(results, data.snapshots ?? data);
    } catch {}
  }
  return results;
}

// ── Math helpers ──────────────────────────────────────────────────────────────

function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  const changes = closes.slice(1).map((c, i) => c - closes[i]);
  const gains = changes.map((c: number) => Math.max(0, c));
  const losses = changes.map((c: number) => Math.max(0, -c));
  let avgGain = gains.slice(0, period).reduce((a: number, b: number) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a: number, b: number) => a + b, 0) / period;
  for (let i = period; i < changes.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function calcSMA(closes: number[], period: number): number {
  const slice = closes.slice(-period);
  if (slice.length === 0) return 0;
  return slice.reduce((a: number, b: number) => a + b, 0) / slice.length;
}

function buildOCCSymbol(ticker: string, expiryDate: string, strike: number): string {
  const [year, month, day] = expiryDate.split('-');
  const dateStr = year.slice(2) + month + day;
  const strikeStr = Math.round(strike * 1000).toString().padStart(8, '0');
  return `${ticker}${dateStr}C${strikeStr}`;
}

function calcDTE(expiryDate: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const exp = new Date(expiryDate + 'T00:00:00');
  return Math.max(0, Math.round((exp.getTime() - now.getTime()) / 86400000));
}

// ── Score engine ──────────────────────────────────────────────────────────────

type SignalAction = 'HOLD_STRONG' | 'HOLD' | 'WATCH' | 'TRIM' | 'EXIT' | 'ROLL' | 'RECOVER_COST';

interface LiveData {
  underlyingPrice: number; underlyingDayChangePct: number; optionMark: number | null;
  rsi14: number; sma200: number; high52w: number; dte: number;
  pctFromStrike: number; pctFrom52wHigh: number; pctAboveSma200: number;
}

function scorePosition(live: LiveData, pnlPct: number | null) {
  const reasons: string[] = [];
  let trend = 0, time = 0, structure = 0, momentum = 0;

  // Trend
  if (live.pctAboveSma200 > 0) { trend += 2; reasons.push(`Above 200d SMA (+${live.pctAboveSma200.toFixed(1)}%) — trend intact`); }
  else { trend -= 2; reasons.push(`Below 200d SMA (${live.pctAboveSma200.toFixed(1)}%) — trend broken ⚠️`); }
  if (live.rsi14 >= 40 && live.rsi14 <= 70) { trend += 1; reasons.push(`RSI healthy (${live.rsi14.toFixed(0)})`); }
  else if (live.rsi14 < 30) { trend -= 1; reasons.push(`RSI oversold (${live.rsi14.toFixed(0)}) ⚠️`); }
  else if (live.rsi14 > 82) { trend -= 1; reasons.push(`RSI extended (${live.rsi14.toFixed(0)}) — mean-revert risk`); }
  trend = Math.max(-3, Math.min(3, trend));

  // Time
  const d = live.dte;
  if (d > 180) { time = 3; reasons.push(`${d}d to expiry — plenty of runway`); }
  else if (d > 90) { time = 2; reasons.push(`${d}d to expiry — good time left`); }
  else if (d > 60) { time = 1; reasons.push(`${d}d to expiry — monitor closely`); }
  else if (d > 45) { time = -1; reasons.push(`${d}d to expiry — theta accelerating ⚠️`); }
  else { time = -3; reasons.push(`${d}d to expiry — theta destroying value ⚠️`); }

  // Structure
  const pct = live.pctFromStrike;
  if (pct > 15) { structure += 1; reasons.push(`Deep ITM (+${pct.toFixed(1)}%) — intrinsic value building`); }
  else if (pct >= -5) { structure += 1; reasons.push(`Near/at strike (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`); }
  else if (pct < -20 && pnlPct !== null && pnlPct < -60) { structure -= 2; reasons.push(`Deep OTM (${pct.toFixed(1)}%) + down ${Math.abs(pnlPct).toFixed(0)}% ⚠️`); }
  else if (pct < -20) { structure -= 1; reasons.push(`Deep OTM (${pct.toFixed(1)}%)`); }
  else { reasons.push(`OTM by ${Math.abs(pct).toFixed(1)}%`); }
  if (pnlPct !== null && pnlPct < -75) { structure -= 3; reasons.push(`Down ${Math.abs(pnlPct).toFixed(0)}% — near total loss ⚠️`); }
  structure = Math.max(-3, Math.min(3, structure));

  // Momentum
  const h = live.pctFrom52wHigh;
  if (h >= -10) { momentum = 2; reasons.push(`Near 52w high (${h.toFixed(1)}%) — momentum strong`); }
  else if (h >= -25) { momentum = 1; reasons.push(`${h.toFixed(1)}% off 52w high — pullback within trend`); }
  else if (h >= -40) { momentum = -1; reasons.push(`${h.toFixed(1)}% off 52w high — significant correction`); }
  else { momentum = -2; reasons.push(`${h.toFixed(1)}% off 52w high — deep correction ⚠️`); }

  const total = trend + time + structure + momentum;

  let action: SignalAction;
  if (pnlPct !== null && pnlPct >= 200) action = 'RECOVER_COST';
  else if (live.pctFromStrike > 15 && live.dte < 90) action = 'ROLL';
  else if (total < 0) action = 'EXIT';
  else if (total <= 1) action = 'TRIM';
  else if (total <= 3) action = 'WATCH';
  else if (total <= 6) action = 'HOLD';
  else action = 'HOLD_STRONG';

  return { axes: { trend, time, structure, momentum }, total, action, reasons };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data, error } = await supabase
    .from('portfolio_positions')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  if (!data || data.length === 0) return res.json({ positions: [], refreshed_at: new Date().toISOString() });

  try {
    const tickers = [...new Set(data.map((p: any) => p.ticker as string))];

    const [barsEntries, snapEntries] = await Promise.all([
      Promise.all(tickers.map(async (t: string) => {
        try { return [t, await getStockBars(t)] as const; }
        catch { return [t, []] as const; }
      })),
      Promise.all(tickers.map(async (t: string) => {
        try { return [t, await getStockSnapshot(t)] as const; }
        catch { return [t, null] as const; }
      })),
    ]);

    const barsMap: Record<string, any[]> = Object.fromEntries(barsEntries);
    const snapMap: Record<string, any>   = Object.fromEntries(snapEntries);

    const occSymbols = data.map((p: any) => buildOCCSymbol(p.ticker, p.expiry_date, p.strike));
    const optSnaps = await getOptionSnapshots(occSymbols);

    const enriched = data.map((p: any, i: number) => {
      const bars = barsMap[p.ticker] ?? [];
      const snap = snapMap[p.ticker];
      const occSym = occSymbols[i];

      if (!snap || bars.length < 20) {
        return { ...p, live: null, score: null, pnlPct: null, pnlDollars: null, currentMark: null };
      }

      const closes = bars.map((b: any) => b.c as number);
      const highs  = bars.map((b: any) => b.h as number);

      const underlyingPrice = snap.latestTrade?.p ?? snap.latestQuote?.ap ?? closes[closes.length - 1] ?? 0;
      const prevClose = snap.prevDailyBar?.c ?? closes[closes.length - 2] ?? underlyingPrice;
      const underlyingDayChangePct = prevClose > 0 ? ((underlyingPrice - prevClose) / prevClose) * 100 : 0;

      const rsi14       = calcRSI(closes);
      const sma200      = calcSMA(closes, Math.min(200, closes.length));
      const slice252    = highs.slice(-252);
      const high52w     = slice252.length > 0 ? Math.max(...slice252) : 0;
      const dte         = calcDTE(p.expiry_date);
      const pctFromStrike  = p.strike > 0 ? ((underlyingPrice - p.strike)  / p.strike)  * 100 : 0;
      const pctFrom52wHigh = high52w  > 0 ? ((underlyingPrice - high52w)   / high52w)   * 100 : 0;
      const pctAboveSma200 = sma200   > 0 ? ((underlyingPrice - sma200)    / sma200)    * 100 : 0;

      const optSnap = optSnaps[occSym] ?? null;
      let optionMark: number | null = null;
      if (optSnap) {
        const bid = optSnap.latestQuote?.bp ?? 0;
        const ask = optSnap.latestQuote?.ap ?? 0;
        if (bid > 0 && ask > 0) optionMark = (bid + ask) / 2;
        else if (optSnap.latestTrade?.p) optionMark = optSnap.latestTrade.p;
      }

      const pnlPct     = optionMark !== null ? ((optionMark - p.avg_cost) / p.avg_cost) * 100 : null;
      const pnlDollars = optionMark !== null ? (optionMark - p.avg_cost) * p.quantity * 100 : null;

      const live: LiveData = {
        underlyingPrice, underlyingDayChangePct, optionMark,
        rsi14, sma200, high52w, dte,
        pctFromStrike, pctFrom52wHigh, pctAboveSma200,
      };

      return { ...p, live, score: scorePosition(live, pnlPct), pnlPct, pnlDollars, currentMark: optionMark };
    });

    return res.json({ positions: enriched, refreshed_at: new Date().toISOString() });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}
