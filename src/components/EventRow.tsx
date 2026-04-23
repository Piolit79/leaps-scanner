import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { cn, fmt } from '../lib/utils';
import EventChart from './EventChart';

interface PullbackSignal {
  date: string;
  type: 'pullback';
  dailyChangePct: number;
  relVolume: number;
  rsi14: number;
  sma200: number;
  pctAboveSma200: number;
  pctFrom52wHigh: number;
  avgDailyVol30d: number;
}

interface OHLCV { t: string; o: number; h: number; l: number; c: number; v: number; }

export interface EventResult {
  id: string;
  ticker: string;
  company_name: string;
  market_cap_b: number;
  current_price: number;
  recent_signals: PullbackSignal[];
  historical_signals: any[];
  ohlc_json: OHLCV[];
}

function RsiBadge({ rsi }: { rsi: number }) {
  const color =
    rsi < 33 ? 'bg-red-950 text-red-300 border-red-800' :
    rsi < 40 ? 'bg-orange-950 text-orange-300 border-orange-800' :
               'bg-yellow-950 text-yellow-300 border-yellow-800';
  return (
    <span className={cn('text-xs font-semibold px-1.5 py-0.5 rounded border', color)}>
      RSI {fmt(rsi, 1)}
    </span>
  );
}

function IvCell({ iv }: { iv: number | null }) {
  if (iv == null) return <span className="text-muted-foreground">—</span>;
  const pct = iv * 100;
  const color = pct < 25 ? 'text-green-400' : pct < 40 ? 'text-yellow-400' : 'text-red-400';
  return <span className={cn('font-mono text-xs', color)}>{fmt(pct, 0)}%</span>;
}

interface Contract {
  symbol: string; strike: number; expiry: string; dte: number;
  mid: number | null; bid: number; ask: number; spread: number | null;
  iv: number | null; delta: number | null; oi: number | null;
}

function OptionsSection({ ticker }: { ticker: string }) {
  const [enabled, setEnabled] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['options', ticker],
    queryFn: async () => {
      const r = await fetch(`/api/options?ticker=${ticker}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const contracts: Contract[] = data?.contracts ?? [];

  if (!enabled) {
    return (
      <button
        onClick={() => setEnabled(true)}
        className="text-xs text-primary underline underline-offset-2 hover:opacity-80"
      >
        Load 9–12 month options →
      </button>
    );
  }

  if (isLoading) return <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 size={12} className="animate-spin" /> Fetching contracts…</div>;
  if (error) return <p className="text-xs text-destructive">Failed to load options.</p>;
  if (!contracts.length) return <p className="text-xs text-muted-foreground">No contracts found (9–12 months out).</p>;

  return (
    <div className="overflow-x-auto rounded border border-border">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-muted-foreground bg-muted/20">
            <th className="px-3 py-1.5 text-left">Strike</th>
            <th className="px-3 py-1.5 text-left">Expiry</th>
            <th className="px-3 py-1.5 text-right">DTE</th>
            <th className="px-3 py-1.5 text-right">Mid</th>
            <th className="px-3 py-1.5 text-right">Bid/Ask</th>
            <th className="px-3 py-1.5 text-right">IV</th>
            <th className="px-3 py-1.5 text-right">Delta</th>
            <th className="px-3 py-1.5 text-right">OI</th>
          </tr>
        </thead>
        <tbody>
          {contracts.map((c, i) => (
            <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/20">
              <td className="px-3 py-1.5 font-mono font-semibold">${fmt(c.strike, 0)}</td>
              <td className="px-3 py-1.5 text-muted-foreground">{c.expiry}</td>
              <td className="px-3 py-1.5 text-right font-mono">{c.dte}</td>
              <td className="px-3 py-1.5 text-right font-mono font-semibold">
                {c.mid ? `$${fmt(c.mid, 2)}` : '—'}
              </td>
              <td className="px-3 py-1.5 text-right text-muted-foreground font-mono">
                {c.bid > 0 ? `${fmt(c.bid, 2)} / ${fmt(c.ask, 2)}` : '—'}
              </td>
              <td className="px-3 py-1.5 text-right"><IvCell iv={c.iv} /></td>
              <td className="px-3 py-1.5 text-right font-mono text-muted-foreground">
                {c.delta != null ? fmt(c.delta, 2) : '—'}
              </td>
              <td className="px-3 py-1.5 text-right text-muted-foreground font-mono">
                {c.oi != null ? c.oi.toLocaleString() : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-3 py-2 text-xs text-muted-foreground">
        Sorted by IV ascending · Green &lt;25% · Yellow 25–40% · Red &gt;40%
      </p>
    </div>
  );
}

function MetricRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className="font-mono text-sm font-semibold">{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

export default function EventRow({ result }: { result: EventResult }) {
  const [expanded, setExpanded] = useState(false);
  const sig = result.recent_signals?.[0];

  if (!sig) return null;

  const volM = (sig.avgDailyVol30d / 1_000_000).toFixed(1);
  const dropColor = sig.dailyChangePct <= -5 ? 'text-red-400' :
                    sig.dailyChangePct <= -3 ? 'text-orange-400' : 'text-yellow-400';

  return (
    <div className="border border-border rounded-lg mb-2 transition-colors">
      {/* Summary row */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/20 rounded-lg"
        onClick={() => setExpanded(x => !x)}
      >
        {/* Ticker */}
        <div className="w-16 flex-shrink-0">
          <span className="font-bold text-sm">{result.ticker}</span>
        </div>

        {/* Company */}
        <div className="flex-1 min-w-0">
          <span className="text-xs text-muted-foreground truncate">{result.company_name}</span>
        </div>

        {/* Price */}
        <div className="font-mono text-sm w-20 text-right flex-shrink-0">
          ${fmt(result.current_price, 2)}
        </div>

        {/* Key metrics */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className={cn('font-mono text-sm font-semibold', dropColor)}>
            {fmt(sig.dailyChangePct, 1)}%
          </span>
          <RsiBadge rsi={sig.rsi14} />
          <span className="text-xs text-muted-foreground font-mono">
            {fmt(sig.relVolume, 1)}× vol
          </span>
          <span className="text-xs text-muted-foreground font-mono">
            {fmt(sig.pctFrom52wHigh, 1)}% hi
          </span>
        </div>

        <div className="flex items-center flex-shrink-0">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">
          {/* Metrics grid */}
          <div className="grid grid-cols-4 gap-4 bg-muted/10 rounded p-3 border border-border">
            <MetricRow
              label="Daily Chg"
              value={`${fmt(sig.dailyChangePct, 2)}%`}
            />
            <MetricRow
              label="RSI(14)"
              value={fmt(sig.rsi14, 1)}
            />
            <MetricRow
              label="Rel Volume"
              value={`${fmt(sig.relVolume, 2)}×`}
              sub={`avg ${volM}M/day`}
            />
            <MetricRow
              label="vs 200d SMA"
              value={`${sig.pctAboveSma200 >= 0 ? '+' : ''}${fmt(sig.pctAboveSma200, 1)}%`}
              sub={`SMA $${fmt(sig.sma200, 2)}`}
            />
            <MetricRow
              label="vs 52w High"
              value={`${fmt(sig.pctFrom52wHigh, 1)}%`}
            />
            <MetricRow
              label="Market Cap"
              value={`$${fmt(result.market_cap_b, 0)}B`}
            />
            <MetricRow
              label="Scan Date"
              value={sig.date}
            />
          </div>

          {/* Chart */}
          <EventChart
            ohlc={result.ohlc_json ?? []}
            eventDates={[sig.date]}
          />

          {/* Options */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Options contracts — 9–12 months (sorted by IV ↑)
            </p>
            <OptionsSection ticker={result.ticker} />
          </div>
        </div>
      )}
    </div>
  );
}
