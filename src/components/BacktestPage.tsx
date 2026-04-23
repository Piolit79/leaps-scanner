import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, Play, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { cn, fmt } from '../lib/utils';

// ── config types ────────────────────────────────────────────────────────────

interface BacktestCfg {
  rsiMin:           string;
  rsiMax:           string;
  minDrop:          string;
  minRelVol:        string;
  gapRange:         string;
  trend:            string;
  belowPriorLow:    string;
}

const DEFAULT_CFG: BacktestCfg = {
  rsiMin:        '35',
  rsiMax:        '50',
  minDrop:       '3',
  minRelVol:     '1.5',
  gapRange:      '1_4',
  trend:         'sma200',
  belowPriorLow: 'no',
};

const GAP_RANGES: Record<string, { label: string; gapMax: number; gapMin: number }> = {
  '1_3': { label: '−1% to −3%', gapMax: -1, gapMin: -3 },
  '1_4': { label: '−1% to −4%', gapMax: -1, gapMin: -4 },
  '1_5': { label: '−1% to −5%', gapMax: -1, gapMin: -5 },
  '2_5': { label: '−2% to −5%', gapMax: -2, gapMin: -5 },
};

function cfgToApi(cfg: BacktestCfg): object {
  const gap = GAP_RANGES[cfg.gapRange] ?? GAP_RANGES['1_4'];
  return {
    rsiMin:                parseFloat(cfg.rsiMin),
    rsiMax:                parseFloat(cfg.rsiMax),
    minDailyDrop:          parseFloat(cfg.minDrop),
    minRelVol:             parseFloat(cfg.minRelVol),
    gapMax:                gap.gapMax,
    gapMin:                gap.gapMin,
    requireAbove50sma:     cfg.trend === 'sma50_200',
    requireBelowPriorLow:  cfg.belowPriorLow === 'yes',
  };
}

// ── api types ────────────────────────────────────────────────────────────────

interface Trade {
  ticker: string;
  day0Date: string;
  day1Date: string;
  day0Close: number;
  day1Open: number;
  gapPct: number;
  day0Rsi: number;
  day0RelVol: number;
  day0Drop: number;
  return5d: number | null;
  return10d: number | null;
  return20d: number | null;
  maxDrawdown20d: number;
  hitProfit5: boolean;
  hitProfit10: boolean;
  hitStop5: boolean;
  hitStop8: boolean;
  reclaimSma20Days: number | null;
}

interface PeriodStats {
  count: number;
  winRate: number;
  avg: number;
  med: number;
  sharpeRatio: number;
}

interface Metrics {
  totalSignals: number;
  dateRange: { from: string; to: string };
  d5: PeriodStats;
  d10: PeriodStats;
  d20: PeriodStats;
  avgMaxDrawdown: number;
  hitProfit5Rate: number;
  hitProfit10Rate: number;
  hitStop5Rate: number;
  hitStop8Rate: number;
  avgReclaimDays: number | null;
  best: { ticker: string; date: string; return20d: number } | null;
  worst: { ticker: string; date: string; return20d: number } | null;
}

// ── shared ui ────────────────────────────────────────────────────────────────

const selectClass =
  'bg-muted border border-border rounded px-2 py-1.5 text-xs text-foreground ' +
  'focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground uppercase tracking-wider">{label}</span>
      {children}
    </label>
  );
}

function RetCell({ v }: { v: number | null }) {
  if (v === null) return <span className="text-muted-foreground font-mono text-xs">—</span>;
  const color = v > 0 ? 'text-green-400' : v < 0 ? 'text-red-400' : 'text-muted-foreground';
  return (
    <span className={cn('font-mono text-xs font-semibold', color)}>
      {v >= 0 ? '+' : ''}{fmt(v, 1)}%
    </span>
  );
}

function HitDot({ hit, label }: { hit: boolean; label: string }) {
  return (
    <span className={cn(
      'text-xs px-1 rounded',
      hit ? 'text-green-400' : 'text-muted-foreground/30',
    )}>
      {label}
    </span>
  );
}

// ── sort ──────────────────────────────────────────────────────────────────────

type SortKey = keyof Pick<Trade,
  'ticker' | 'day0Date' | 'day1Date' | 'day1Open' | 'gapPct' | 'day0Rsi' |
  'day0RelVol' | 'day0Drop' | 'return5d' | 'return10d' | 'return20d' | 'maxDrawdown20d'
>;

function sortTrades(trades: Trade[], key: SortKey, dir: 'asc' | 'desc'): Trade[] {
  return [...trades].sort((a, b) => {
    const av = a[key] ?? (dir === 'asc' ? Infinity : -Infinity);
    const bv = b[key] ?? (dir === 'asc' ? Infinity : -Infinity);
    if (typeof av === 'string' && typeof bv === 'string') {
      return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    return dir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });
}

function SortIcon({ col, active, dir }: { col: string; active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <ChevronsUpDown size={10} className="text-muted-foreground/40 inline ml-0.5" />;
  return dir === 'asc'
    ? <ChevronUp size={10} className="text-primary inline ml-0.5" />
    : <ChevronDown size={10} className="text-primary inline ml-0.5" />;
}

// ── summary metrics ──────────────────────────────────────────────────────────

function StatBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-muted/20 border border-border rounded p-3">
      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">{label}</p>
      {children}
    </div>
  );
}

function MetricsSummary({ m }: { m: Metrics }) {
  const periods = [
    { label: '5-Day',  s: m.d5  },
    { label: '10-Day', s: m.d10 },
    { label: '20-Day', s: m.d20 },
  ];

  return (
    <div className="space-y-4 mb-6">
      {/* Header */}
      <div className="flex items-center gap-4 text-sm">
        <span>
          <span className="font-bold text-lg text-primary">{m.totalSignals}</span>
          {' '}signals
        </span>
        <span className="text-muted-foreground text-xs">
          {m.dateRange.from} → {m.dateRange.to}
        </span>
      </div>

      {/* Win rate / returns / Sharpe table */}
      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/20 text-muted-foreground">
              <th className="px-3 py-2 text-left w-28"></th>
              {periods.map(p => (
                <th key={p.label} className="px-3 py-2 text-right font-semibold">{p.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              {
                label: 'Signals (n)',
                vals: periods.map(p => <span key={p.label} className="font-mono">{p.s.count}</span>),
              },
              {
                label: 'Win Rate',
                vals: periods.map(p => {
                  const color = p.s.winRate >= 55 ? 'text-green-400' : p.s.winRate >= 45 ? 'text-yellow-400' : 'text-red-400';
                  return <span key={p.label} className={cn('font-mono font-semibold', color)}>{fmt(p.s.winRate, 1)}%</span>;
                }),
              },
              {
                label: 'Avg Return',
                vals: periods.map(p => <RetCell key={p.label} v={p.s.avg} />),
              },
              {
                label: 'Median Return',
                vals: periods.map(p => <RetCell key={p.label} v={p.s.med} />),
              },
              {
                label: 'Sharpe',
                vals: periods.map(p => {
                  const color = p.s.sharpeRatio >= 1 ? 'text-green-400' : p.s.sharpeRatio >= 0 ? 'text-yellow-400' : 'text-red-400';
                  return <span key={p.label} className={cn('font-mono', color)}>{fmt(p.s.sharpeRatio, 2)}</span>;
                }),
              },
            ].map(row => (
              <tr key={row.label} className="border-b border-border last:border-0">
                <td className="px-3 py-1.5 text-muted-foreground">{row.label}</td>
                {row.vals.map((v, i) => (
                  <td key={i} className="px-3 py-1.5 text-right">{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bottom stat boxes */}
      <div className="grid grid-cols-3 gap-3">
        <StatBox label="Drawdown / Reclaim">
          <p className="text-sm font-mono font-semibold text-red-400">
            {fmt(m.avgMaxDrawdown, 1)}% avg max DD
          </p>
          {m.avgReclaimDays != null && (
            <p className="text-xs text-muted-foreground mt-1">
              Reclaim 20d SMA avg: {fmt(m.avgReclaimDays, 1)} days
            </p>
          )}
        </StatBox>

        <StatBox label="Profit Targets (20d window)">
          <div className="space-y-0.5">
            <p className="text-xs">
              <span className="text-green-400 font-mono font-semibold">+5%</span>
              <span className="text-muted-foreground ml-2">hit {fmt(m.hitProfit5Rate, 1)}% of trades</span>
            </p>
            <p className="text-xs">
              <span className="text-green-400 font-mono font-semibold">+10%</span>
              <span className="text-muted-foreground ml-2">hit {fmt(m.hitProfit10Rate, 1)}% of trades</span>
            </p>
          </div>
        </StatBox>

        <StatBox label="Stop Losses (20d window)">
          <div className="space-y-0.5">
            <p className="text-xs">
              <span className="text-red-400 font-mono font-semibold">−5%</span>
              <span className="text-muted-foreground ml-2">hit {fmt(m.hitStop5Rate, 1)}% of trades</span>
            </p>
            <p className="text-xs">
              <span className="text-red-400 font-mono font-semibold">−8%</span>
              <span className="text-muted-foreground ml-2">hit {fmt(m.hitStop8Rate, 1)}% of trades</span>
            </p>
          </div>
        </StatBox>
      </div>

      {/* Best / worst */}
      <div className="flex gap-4 text-xs text-muted-foreground">
        {m.best && (
          <span>
            Best: <span className="text-foreground font-semibold">{m.best.ticker}</span>
            {' '}<span className="text-green-400 font-mono">+{fmt(m.best.return20d, 1)}%</span>
            {' '}({m.best.date})
          </span>
        )}
        {m.worst && (
          <span>
            Worst: <span className="text-foreground font-semibold">{m.worst.ticker}</span>
            {' '}<span className="text-red-400 font-mono">{fmt(m.worst.return20d, 1)}%</span>
            {' '}({m.worst.date})
          </span>
        )}
      </div>
    </div>
  );
}

// ── trades table ─────────────────────────────────────────────────────────────

const COLUMNS: { key: SortKey; label: string; right?: boolean }[] = [
  { key: 'ticker',        label: 'Ticker' },
  { key: 'day0Date',      label: 'Day 0' },
  { key: 'day1Date',      label: 'Day 1' },
  { key: 'day1Open',      label: 'Entry',    right: true },
  { key: 'gapPct',        label: 'Gap %',    right: true },
  { key: 'day0Rsi',       label: 'RSI',      right: true },
  { key: 'day0RelVol',    label: 'RelVol',   right: true },
  { key: 'day0Drop',      label: 'Day0 Drop', right: true },
  { key: 'return5d',      label: '5d',       right: true },
  { key: 'return10d',     label: '10d',      right: true },
  { key: 'return20d',     label: '20d',      right: true },
  { key: 'maxDrawdown20d', label: 'Max DD',  right: true },
];

function TradesTable({ trades }: { trades: Trade[] }) {
  const [sortKey, setSortKey]  = useState<SortKey>('day0Date');
  const [sortDir, setSortDir]  = useState<'asc' | 'desc'>('desc');
  const [showAll, setShowAll]  = useState(false);

  const sorted = sortTrades(trades, sortKey, sortDir);
  const visible = showAll ? sorted : sorted.slice(0, 200);

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          All Trades ({trades.length})
        </p>
        {trades.length > 200 && !showAll && (
          <button
            onClick={() => setShowAll(true)}
            className="text-xs text-primary underline underline-offset-2"
          >
            Show all {trades.length}
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full text-xs whitespace-nowrap">
          <thead>
            <tr className="border-b border-border bg-muted/20 text-muted-foreground">
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={cn(
                    'px-2 py-1.5 cursor-pointer hover:text-foreground select-none',
                    col.right ? 'text-right' : 'text-left',
                  )}
                >
                  {col.label}
                  <SortIcon col={col.key} active={sortKey === col.key} dir={sortDir} />
                </th>
              ))}
              <th className="px-2 py-1.5 text-center text-muted-foreground">Exits</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((t, i) => (
              <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/10">
                <td className="px-2 py-1.5 font-semibold">{t.ticker}</td>
                <td className="px-2 py-1.5 text-muted-foreground">{t.day0Date}</td>
                <td className="px-2 py-1.5 text-muted-foreground">{t.day1Date}</td>
                <td className="px-2 py-1.5 text-right font-mono">${fmt(t.day1Open, 2)}</td>
                <td className="px-2 py-1.5 text-right font-mono text-muted-foreground">
                  {fmt(t.gapPct, 1)}%
                </td>
                <td className="px-2 py-1.5 text-right font-mono">{fmt(t.day0Rsi, 1)}</td>
                <td className="px-2 py-1.5 text-right font-mono text-muted-foreground">
                  {fmt(t.day0RelVol, 1)}×
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-red-400/80">
                  {fmt(t.day0Drop, 1)}%
                </td>
                <td className="px-2 py-1.5 text-right"><RetCell v={t.return5d} /></td>
                <td className="px-2 py-1.5 text-right"><RetCell v={t.return10d} /></td>
                <td className="px-2 py-1.5 text-right"><RetCell v={t.return20d} /></td>
                <td className="px-2 py-1.5 text-right font-mono text-red-400/80">
                  {fmt(t.maxDrawdown20d, 1)}%
                </td>
                <td className="px-2 py-1.5 text-center">
                  <HitDot hit={t.hitProfit5}  label="P5"  />
                  <HitDot hit={t.hitProfit10} label="P10" />
                  <HitDot hit={t.hitStop5}    label="S5"  />
                  <HitDot hit={t.hitStop8}    label="S8"  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {trades.length > 200 && !showAll && (
        <p className="text-xs text-muted-foreground mt-1.5">
          Showing 200 of {trades.length} — <button onClick={() => setShowAll(true)} className="underline">show all</button>
        </p>
      )}
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function BacktestPage() {
  const [cfg, setCfg]     = useState<BacktestCfg>(DEFAULT_CFG);
  const [trades, setTrades]   = useState<Trade[] | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const set = (key: keyof BacktestCfg) => (e: React.ChangeEvent<HTMLSelectElement>) =>
    setCfg(c => ({ ...c, [key]: e.target.value }));

  const run = useMutation({
    mutationFn: async () => {
      setErrorMsg('');
      const r = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: cfgToApi(cfg) }),
      });
      const data = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
      if (!r.ok) throw new Error(data?.error ?? `HTTP ${r.status}`);
      return data;
    },
    onSuccess: (d) => {
      setTrades(d.trades ?? []);
      setMetrics(d.metrics ?? null);
    },
    onError: (e: any) => setErrorMsg(`Error: ${e.message}`),
  });

  const isDefault = JSON.stringify(cfg) === JSON.stringify(DEFAULT_CFG);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="px-6 py-5 max-w-5xl mx-auto">

        {/* Config panel */}
        <div className="bg-muted/20 border border-border rounded-lg px-4 py-3 mb-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Backtest Parameters
            </span>
            {!isDefault && (
              <button
                onClick={() => setCfg(DEFAULT_CFG)}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Reset
              </button>
            )}
          </div>

          <div className="mb-3">
            <p className="text-xs text-muted-foreground/60 mb-2 font-medium">Day 0 conditions</p>
            <div className="flex flex-wrap gap-4">
              <Field label="RSI Min">
                <select className={selectClass} value={cfg.rsiMin} onChange={set('rsiMin')}>
                  <option value="25">≥ 25</option>
                  <option value="28">≥ 28</option>
                  <option value="30">≥ 30</option>
                  <option value="32">≥ 32</option>
                  <option value="35">≥ 35</option>
                  <option value="38">≥ 38</option>
                  <option value="40">≥ 40</option>
                </select>
              </Field>

              <Field label="RSI Max">
                <select className={selectClass} value={cfg.rsiMax} onChange={set('rsiMax')}>
                  <option value="40">≤ 40</option>
                  <option value="42">≤ 42</option>
                  <option value="45">≤ 45</option>
                  <option value="48">≤ 48</option>
                  <option value="50">≤ 50</option>
                  <option value="55">≤ 55</option>
                </select>
              </Field>

              <Field label="Min Daily Drop">
                <select className={selectClass} value={cfg.minDrop} onChange={set('minDrop')}>
                  <option value="2">≤ −2%</option>
                  <option value="3">≤ −3%</option>
                  <option value="4">≤ −4%</option>
                  <option value="5">≤ −5%</option>
                </select>
              </Field>

              <Field label="Rel Volume">
                <select className={selectClass} value={cfg.minRelVol} onChange={set('minRelVol')}>
                  <option value="1.5">≥ 1.5×</option>
                  <option value="2.0">≥ 2.0×</option>
                  <option value="2.5">≥ 2.5×</option>
                </select>
              </Field>

              <Field label="Trend Filter">
                <select className={selectClass} value={cfg.trend} onChange={set('trend')}>
                  <option value="sma200">Close &gt; 200d SMA</option>
                  <option value="sma50_200">Close &gt; 50d &amp; 200d</option>
                </select>
              </Field>
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground/60 mb-2 font-medium">Day 1 trigger</p>
            <div className="flex flex-wrap gap-4">
              <Field label="Gap Down Range">
                <select className={selectClass} value={cfg.gapRange} onChange={set('gapRange')}>
                  {Object.entries(GAP_RANGES).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </Field>

              <Field label="Below Prior Low">
                <select className={selectClass} value={cfg.belowPriorLow} onChange={set('belowPriorLow')}>
                  <option value="no">Not required</option>
                  <option value="yes">Required (strong flush)</option>
                </select>
              </Field>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-border flex items-center gap-4">
            <button
              onClick={() => run.mutate()}
              disabled={run.isPending}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {run.isPending ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              {run.isPending ? 'Running backtest…' : 'Run Backtest'}
            </button>
            <p className="text-xs text-muted-foreground">
              Scans 64 large-caps · ~4 years of data · 2–4 min
            </p>
          </div>
        </div>

        {/* Loading */}
        {run.isPending && (
          <div className="p-3 bg-muted rounded text-xs text-muted-foreground mb-5">
            Fetching historical bars and scanning for signals — hang tight, this takes 2–4 minutes…
          </div>
        )}

        {/* Error */}
        {errorMsg && !run.isPending && (
          <p className="text-destructive text-sm mb-5">{errorMsg}</p>
        )}

        {/* Results */}
        {!run.isPending && metrics && trades && (
          <>
            <MetricsSummary m={metrics} />
            {trades.length > 0
              ? <TradesTable trades={trades} />
              : <p className="text-muted-foreground text-sm">No signals found with these parameters.</p>
            }
          </>
        )}

        {/* Placeholder before first run */}
        {!run.isPending && !metrics && !errorMsg && (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-base">Configure parameters above and click Run Backtest.</p>
            <p className="text-sm mt-1">
              Tests a gap-down entry strategy across 64 large-caps over ~4 years of daily data.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
