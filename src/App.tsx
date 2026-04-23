import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Loader2, RefreshCw } from 'lucide-react';
import EventRow, { type EventResult } from './components/EventRow';
import ScanFilters, { DEFAULT_FILTERS, type FilterState } from './components/ScanFilters';

const queryClient = new QueryClient();

async function fetchResults() {
  const r = await fetch('/api/event-results');
  if (!r.ok) throw new Error('Failed to load results');
  return r.json();
}

async function triggerScan() {
  const r = await fetch('/api/event-scan', { method: 'POST' });
  const data = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
  if (!r.ok) throw new Error(data?.error ?? `HTTP ${r.status}`);
  return data;
}

function applyFilters(results: EventResult[], f: FilterState): EventResult[] {
  const minCapB   = parseFloat(f.minCapB);
  const minVolRaw = parseFloat(f.minVolM) * 1_000_000;
  const rsiMin    = parseFloat(f.rsiMin);
  const rsiMax    = parseFloat(f.rsiMax);
  const minDrop   = parseFloat(f.minDrop);
  const minRelVol = parseFloat(f.minRelVol);

  return results.filter(r => {
    const sig = r.recent_signals?.[0] as any;
    if (!sig || sig.type !== 'pullback') return false;

    if (r.market_cap_b < minCapB) return false;
    if (sig.avgDailyVol30d < minVolRaw) return false;
    if (f.aboveSma200 === 'yes' && sig.pctAboveSma200 < 0) return false;
    if (sig.rsi14 < rsiMin || sig.rsi14 > rsiMax) return false;
    if (sig.dailyChangePct > -minDrop) return false;
    if (sig.relVolume < minRelVol) return false;
    if (f.highRange === 'yes' && (sig.pctFrom52wHigh < -25 || sig.pctFrom52wHigh > -10)) return false;

    return true;
  });
}

function Scanner() {
  const qc = useQueryClient();
  const [msg, setMsg]         = useState('');
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  const { data, isLoading, error } = useQuery({
    queryKey: ['event-results'],
    queryFn: fetchResults,
    refetchInterval: 60000,
  });

  const scan = useMutation({
    mutationFn: triggerScan,
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['event-results'] });
      setMsg(`Scan complete — ${d.found ?? 0} stocks computed.`);
    },
    onError: (e: any) => setMsg(`Error: ${e.message}`),
  });

  // Sort by biggest daily drop first
  const allResults: EventResult[] = (data?.results ?? []).sort((a: EventResult, b: EventResult) => {
    const aSig = a.recent_signals?.[0] as any;
    const bSig = b.recent_signals?.[0] as any;
    return (aSig?.dailyChangePct ?? 0) - (bSig?.dailyChangePct ?? 0);
  });

  const results = applyFilters(allResults, filters);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-primary tracking-tight">Pullback Scanner</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Large-cap uptrend pullbacks · RSI 30–45 · 9–12mo LEAPS · 64 stocks
          </p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => { setMsg(''); scan.mutate(); }}
            disabled={scan.isPending}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {scan.isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {scan.isPending ? 'Scanning…' : 'Run Scan'}
          </button>
        </div>
      </header>

      {scan.isPending && (
        <div className="mx-6 mt-4 p-3 bg-muted rounded text-xs text-muted-foreground">
          Fetching 2 years of bars for 64 large-caps and computing metrics — takes 2–4 min.
        </div>
      )}
      {msg && !scan.isPending && (
        <div className="mx-6 mt-4 p-3 bg-muted rounded text-xs text-muted-foreground">{msg}</div>
      )}

      <main className="px-6 py-5 max-w-5xl mx-auto">
        <ScanFilters
          filters={filters}
          onChange={setFilters}
          onReset={() => setFilters(DEFAULT_FILTERS)}
        />

        {!isLoading && !error && allResults.length > 0 && (
          <div className="flex items-center gap-4 mb-4 text-xs text-muted-foreground">
            <span>
              <span className="text-foreground font-semibold">{results.length}</span>
              {results.length !== allResults.length && ` of ${allResults.length}`}
              {' '}stocks match current filters
            </span>
            {data?.scan_date && <span>Last scan: {data.scan_date}</span>}
          </div>
        )}

        {isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm pt-8">
            <Loader2 size={16} className="animate-spin" /> Loading…
          </div>
        )}
        {error && <p className="text-destructive text-sm pt-8">Failed to load results.</p>}

        {!isLoading && !error && allResults.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-base">No scan results yet.</p>
            <p className="text-sm mt-1">
              Click "Run Scan" to compute pullback metrics across 64 large-caps.
            </p>
          </div>
        )}

        {!isLoading && !error && allResults.length > 0 && results.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">
            No stocks match the current filter settings — try loosening the thresholds.
          </div>
        )}

        {results.map(r => <EventRow key={r.id} result={r} />)}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Scanner />
    </QueryClientProvider>
  );
}
