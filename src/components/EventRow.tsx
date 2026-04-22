import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Loader2, TrendingDown } from 'lucide-react';
import { cn, fmt } from '../lib/utils';
import EventChart from './EventChart';
import type { FilterState } from './ScanFilters';

interface EventSignal {
  date: string;
  type: 'gap_volume' | 'high_drop';
  closePct: number;
  gapPct: number;
  volumeRatio: number;
  dropFromHighPct: number;
  priceOnEvent: number;
  wasAboveSma20: boolean;
  recovery20d: number | null;
  recovery60d: number | null;
}

interface OHLCV { t: string; o: number; h: number; l: number; c: number; v: number; }

export interface EventResult {
  id: string;
  ticker: string;
  company_name: string;
  market_cap_b: number;
  current_price: number;
  recent_signals: EventSignal[];
  historical_signals: EventSignal[];
  ohlc_json: OHLCV[];
}

function SignalBadge({ type }: { type: EventSignal['type'] }) {
  return (
    <span className={cn(
      'text-xs font-semibold px-1.5 py-0.5 rounded',
      type === 'gap_volume'
        ? 'bg-red-950 text-red-300 border border-red-800'
        : 'bg-orange-950 text-orange-300 border border-orange-800',
    )}>
      {type === 'gap_volume' ? 'GAP+VOL' : 'HIGH-DROP'}
    </span>
  );
}

function RecoveryCell({ v }: { v: number | null }) {
  if (v === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn('font-mono text-xs', v >= 0 ? 'text-green-400' : 'text-red-400')}>
      {v >= 0 ? '+' : ''}{fmt(v, 1)}%
    </span>
  );
}

function IvCell({ iv }: { iv: number | null }) {
  if (iv == null) return <span className="text-muted-foreground">—</span>;
  const pct = iv * 100;
  const color = pct < 25 ? 'text-green-400' : pct < 40 ? 'text-yellow-400' : 'text-red-400';
  return <span className={cn('font-mono text-xs', color)}>{fmt(pct, 0)}%</span>;
}

function HistoryTable({ signals }: { signals: EventSignal[] }) {
  if (!signals.length) return null;
  return (
    <div className="mt-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        Historical signals — past examples ({signals.length})
      </p>
      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground bg-muted/20">
              <th className="px-3 py-1.5 text-left">Date</th>
              <th className="px-3 py-1.5 text-left">Type</th>
              <th className="px-3 py-1.5 text-right">Close Δ</th>
              <th className="px-3 py-1.5 text-right">Vol Ratio</th>
              <th className="px-3 py-1.5 text-right">Price</th>
              <th className="px-3 py-1.5 text-right">+20d</th>
              <th className="px-3 py-1.5 text-right">+60d</th>
              <th className="px-3 py-1.5 text-center">Qual.</th>
            </tr>
          </thead>
          <tbody>
            {signals.map((s, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                <td className="px-3 py-1.5 text-muted-foreground">{s.date}</td>
                <td className="px-3 py-1.5"><SignalBadge type={s.type} /></td>
                <td className="px-3 py-1.5 text-right text-red-400 font-mono">{fmt(s.closePct, 1)}%</td>
                <td className="px-3 py-1.5 text-right font-mono text-muted-foreground">{fmt(s.volumeRatio, 1)}×</td>
                <td className="px-3 py-1.5 text-right font-mono">${fmt(s.priceOnEvent, 2)}</td>
                <td className="px-3 py-1.5 text-right"><RecoveryCell v={s.recovery20d} /></td>
                <td className="px-3 py-1.5 text-right"><RecoveryCell v={s.recovery60d} /></td>
                <td className="px-3 py-1.5 text-center text-xs">
                  {s.wasAboveSma20
                    ? <span className="text-green-500">✓</span>
                    : <span className="text-muted-foreground">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground mt-1.5">
        Qual. = stock was above 20 SMA before event · +20d/+60d = price recovery after trigger
      </p>
    </div>
  );
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
        Sorted by IV ascending (lowest IV = cheapest relative to expected move)
        · Green IV &lt;25% · Yellow 25–40% · Red &gt;40%
      </p>
    </div>
  );
}

function filterSignal(s: EventSignal, f: FilterState): boolean {
  if (f.signalType === 'gap_volume' && s.type !== 'gap_volume') return false;
  if (f.signalType === 'high_drop'  && s.type !== 'high_drop')  return false;
  const gapPct      = parseFloat(f.gapPct);
  const volRatio    = parseFloat(f.volRatio);
  const highDropPct = parseFloat(f.highDropPct);
  if (s.type === 'gap_volume') {
    const drop = Math.min(s.closePct, s.gapPct);
    return drop <= -gapPct && s.volumeRatio >= volRatio;
  }
  if (s.type === 'high_drop') {
    return s.dropFromHighPct <= -highDropPct;
  }
  return true;
}

export default function EventRow({ result, filters }: { result: EventResult; filters: FilterState }) {
  const [expanded, setExpanded] = useState(false);

  const signals = (result.recent_signals ?? []).filter(s => filterSignal(s, filters));
  const latest  = signals[signals.length - 1];
  const daysSince = latest
    ? Math.floor((Date.now() - new Date(latest.date).getTime()) / 86400000)
    : null;

  // Biggest single-day drop across all recent signals
  const maxDrop = signals.reduce((best, s) => Math.min(best, s.closePct, s.gapPct), 0);

  const isFresh = daysSince !== null && daysSince <= 7;

  return (
    <div className={cn(
      'border border-border rounded-lg mb-2 transition-colors',
      isFresh && 'border-red-900/60',
    )}>
      {/* Summary row */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/20 rounded-lg"
        onClick={() => setExpanded(x => !x)}
      >
        {/* Fresh indicator */}
        {isFresh && <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />}

        {/* Ticker */}
        <div className="w-16 flex-shrink-0">
          <span className="font-bold text-sm">{result.ticker}</span>
        </div>

        {/* Company */}
        <div className="flex-1 min-w-0">
          <span className="text-xs text-muted-foreground truncate">{result.company_name}</span>
        </div>

        {/* Current price */}
        <div className="font-mono text-sm w-20 text-right flex-shrink-0">
          ${fmt(result.current_price, 2)}
        </div>

        {/* Event summary */}
        {latest && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <TrendingDown size={13} className="text-red-400" />
            <span className="font-mono text-sm font-semibold text-red-400">
              {fmt(maxDrop, 1)}%
            </span>
            <span className="text-xs text-muted-foreground">
              {daysSince === 0 ? 'today' : daysSince === 1 ? '1d ago' : `${daysSince}d ago`}
            </span>
            <SignalBadge type={latest.type} />
          </div>
        )}

        {/* Signal counts */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-shrink-0">
          {signals.length > 1 && <span>{signals.length} signals</span>}
          {result.historical_signals?.length > 0 && (
            <span className="text-muted-foreground/60">
              {result.historical_signals.length} hist.
            </span>
          )}
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">
          {/* Chart */}
          <EventChart
            ohlc={result.ohlc_json ?? []}
            eventDates={signals.map(s => s.date)}
          />

          {/* Historical signals — filtered to match current thresholds */}
          <HistoryTable signals={(result.historical_signals ?? []).filter(s => filterSignal(s, filters))} />

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
