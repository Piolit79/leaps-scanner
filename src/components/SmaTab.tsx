import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { cn, fmt } from '../lib/utils';

interface SmaDipSignal {
  date: string;
  close: number;
  sma20: number;
  dropPct: number;
}

interface SmaResult {
  id: string;
  ticker: string;
  company_name: string;
  market_cap_b: number;
  current_price: number;
  current_sma20: number;
  current_drop_pct: number;
  is_current: boolean;
  signal_count: number;
  max_drop_pct: number;
  first_signal_date: string | null;
  last_signal_date: string | null;
  signals_json: SmaDipSignal[];
  price_history_json: Array<{ date: string; close: number; sma20: number }>;
}

async function fetchSmaResults() {
  const r = await fetch('/api/sma-results');
  if (!r.ok) throw new Error('Failed to load SMA results');
  return r.json();
}

async function triggerSmaScan() {
  const r = await fetch('/api/sma-scan', { method: 'POST' });
  const data = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
  if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
  return data;
}

function SmaChart({ priceHistory, signalDates }: {
  priceHistory: SmaResult['price_history_json'];
  signalDates: Set<string>;
}) {
  const data = priceHistory.map(p => ({
    date: p.date.slice(5),
    fullDate: p.date,
    close: +p.close.toFixed(2),
    sma20: +p.sma20.toFixed(2),
    threshold: +(p.sma20 * 0.9).toFixed(2),
  }));

  const CustomDot = (props: any) => {
    const { cx, cy, payload } = props;
    if (!signalDates.has(payload.fullDate)) return null;
    return <circle cx={cx} cy={cy} r={3} fill="#ef4444" stroke="none" />;
  };

  return (
    <div className="px-4 pb-4 pt-2">
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis
            dataKey="date"
            tick={{ fill: '#6b7280', fontSize: 10 }}
            interval={Math.max(1, Math.floor(data.length / 9))}
          />
          <YAxis
            tick={{ fill: '#6b7280', fontSize: 10 }}
            domain={['auto', 'auto']}
            width={54}
            tickFormatter={v => `$${Number(v).toFixed(0)}`}
          />
          <Tooltip
            contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 4, fontSize: 11 }}
            labelStyle={{ color: '#6b7280' }}
            formatter={(v: any, name: string) => [`$${Number(v).toFixed(2)}`, name]}
          />
          <Line
            type="monotone"
            dataKey="close"
            stroke="#3b82f6"
            dot={<CustomDot />}
            activeDot={{ r: 3 }}
            strokeWidth={1.5}
            name="Price"
          />
          <Line
            type="monotone"
            dataKey="sma20"
            stroke="#f59e0b"
            dot={false}
            strokeWidth={1.5}
            name="20 SMA"
          />
          <Line
            type="monotone"
            dataKey="threshold"
            stroke="#ef4444"
            dot={false}
            strokeWidth={1}
            strokeDasharray="5 3"
            name="−10% threshold"
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="flex items-center gap-5 mt-2 justify-center text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-px bg-blue-500" style={{ height: 2 }} /> Price
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 bg-amber-500" style={{ height: 2 }} /> 20 SMA
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 bg-red-500" style={{ height: 2, borderTop: '1px dashed #ef4444' }} /> −10% threshold
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-red-500" /> Signal date
        </span>
      </div>
    </div>
  );
}

function SmaRow({ result }: { result: SmaResult }) {
  const [expanded, setExpanded] = useState(false);
  const { is_current } = result;
  const signalDates = new Set(result.signals_json?.map(s => s.date) ?? []);

  return (
    <>
      <tr
        className={cn(
          'border-b border-border cursor-pointer hover:bg-muted/30 transition-colors',
          !is_current && 'opacity-40',
        )}
        onClick={() => setExpanded(x => !x)}
      >
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            {is_current && <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />}
            <span className="font-bold text-sm">{result.ticker}</span>
          </div>
        </td>
        <td className="px-3 py-2.5 text-muted-foreground text-sm max-w-[180px] truncate">
          {result.company_name}
        </td>
        <td className="px-3 py-2.5 text-right text-sm font-mono">
          ${fmt(result.current_price, 2)}
        </td>
        <td className="px-3 py-2.5 text-right text-sm font-mono text-amber-400">
          ${fmt(result.current_sma20, 2)}
        </td>
        <td className={cn(
          'px-3 py-2.5 text-right text-sm font-mono font-semibold',
          result.current_drop_pct <= -10 ? 'text-red-400' : 'text-muted-foreground',
        )}>
          {fmt(result.current_drop_pct, 1)}%
        </td>
        <td className="px-3 py-2.5 text-right text-sm font-mono text-red-300">
          {fmt(result.max_drop_pct, 1)}%
        </td>
        <td className="px-3 py-2.5 text-right text-sm text-muted-foreground">
          {result.signal_count}
        </td>
        <td className="px-3 py-2.5 text-right text-sm text-muted-foreground">
          {result.last_signal_date ?? '—'}
        </td>
        <td className="px-3 py-2.5 text-center">
          <span className={cn(
            'text-xs px-2 py-0.5 rounded font-medium',
            is_current
              ? 'bg-red-950 text-red-300 border border-red-800'
              : 'bg-muted text-muted-foreground',
          )}>
            {is_current ? 'CURRENT' : 'HISTORICAL'}
          </span>
        </td>
        <td className="px-3 py-2.5 text-center text-muted-foreground">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </td>
      </tr>
      {expanded && (
        <tr className={cn('border-b border-border bg-muted/10', !is_current && 'opacity-40')}>
          <td colSpan={10}>
            <SmaChart
              priceHistory={result.price_history_json ?? []}
              signalDates={signalDates}
            />
          </td>
        </tr>
      )}
    </>
  );
}

export default function SmaTab() {
  const qc = useQueryClient();
  const [msg, setMsg] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['sma-results'],
    queryFn: fetchSmaResults,
    refetchInterval: 60000,
  });

  const scan = useMutation({
    mutationFn: triggerSmaScan,
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['sma-results'] });
      setMsg(`SMA scan complete — ${d.found ?? 0} stocks with signals found.`);
    },
    onError: (e: any) => setMsg(`Error: ${e.message}`),
  });

  const results: SmaResult[] = data?.results ?? [];
  const currentCount = results.filter(r => r.is_current).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm text-muted-foreground">
            Large-cap stocks ≥10% below 20-day SMA · 90-day lookback · {results.length} stocks with signals
            {currentCount > 0 && (
              <span className="text-red-400 font-semibold"> · {currentCount} currently triggered</span>
            )}
          </p>
          {data?.scan_date && (
            <p className="text-xs text-muted-foreground mt-0.5">Last scan: {data.scan_date}</p>
          )}
        </div>
        <button
          onClick={() => { setMsg(''); scan.mutate(); }}
          disabled={scan.isPending}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {scan.isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {scan.isPending ? 'Scanning...' : 'Run SMA Scan'}
        </button>
      </div>

      {scan.isPending && (
        <div className="mb-4 p-3 bg-muted rounded text-xs text-muted-foreground">
          Scanning {'>'}60 large-cap stocks for 10% below 20 SMA — usually takes ~1 min.
        </div>
      )}
      {msg && !scan.isPending && (
        <div className="mb-4 p-3 bg-muted rounded text-xs text-muted-foreground">{msg}</div>
      )}

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 size={16} className="animate-spin" /> Loading results...
        </div>
      )}
      {error && <p className="text-destructive text-sm">Failed to load SMA results.</p>}

      {!isLoading && !error && results.length > 0 && (
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground text-xs uppercase tracking-wider bg-muted/30">
                <th className="px-3 py-2 text-left">Ticker</th>
                <th className="px-3 py-2 text-left">Company</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2 text-right">20 SMA</th>
                <th className="px-3 py-2 text-right">vs SMA</th>
                <th className="px-3 py-2 text-right">Max Dip</th>
                <th className="px-3 py-2 text-right">Signals</th>
                <th className="px-3 py-2 text-right">Last Signal</th>
                <th className="px-3 py-2 text-center">Status</th>
                <th className="px-3 py-2 w-8" />
              </tr>
            </thead>
            <tbody>
              {results.map(r => <SmaRow key={r.id} result={r} />)}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && !error && results.length === 0 && (
        <div className="text-center py-16 text-muted-foreground text-sm">
          No SMA dip signals found in the last 90 days. Run a scan to check current conditions.
        </div>
      )}
    </div>
  );
}
