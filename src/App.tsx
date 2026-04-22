import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Loader2, RefreshCw, Zap } from 'lucide-react';
import EventRow, { type EventResult } from './components/EventRow';
import ScanFilters, { DEFAULT_FILTERS, type FilterState } from './components/ScanFilters';

const queryClient = new QueryClient();

async function fetchResults() {
  const r = await fetch('/api/event-results');
  if (!r.ok) throw new Error('Failed to load results');
  return r.json();
}

async function triggerScan(config: object) {
  const r = await fetch('/api/event-scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config }),
  });
  const data = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
  if (!r.ok) throw new Error(data?.error ?? `HTTP ${r.status}`);
  return data;
}

function buildConfig(f: FilterState) {
  return {
    gapPct:      parseFloat(f.gapPct),
    volRatio:    parseFloat(f.volRatio),
    highDropPct: parseFloat(f.highDropPct),
    recentBars:  parseInt(f.recentBars),
  };
}

function applyFilters(results: EventResult[], f: FilterState): EventResult[] {
  const gapPct      = parseFloat(f.gapPct);
  const volRatio    = parseFloat(f.volRatio);
  const highDropPct = parseFloat(f.highDropPct);

  return results.filter(r => {
    const sigs = r.recent_signals ?? [];

    // At least one signal must satisfy the current filter settings
    return sigs.some(s => {
      if (f.signalType === 'gap_volume' && s.type !== 'gap_volume') return false;
      if (f.signalType === 'high_drop'  && s.type !== 'high_drop')  return false;

      if (s.type === 'gap_volume') {
        const drop = Math.min(s.closePct, s.gapPct);
        return drop <= -gapPct && s.volumeRatio >= volRatio;
      }
      if (s.type === 'high_drop') {
        return s.dropFromHighPct <= -highDropPct;
      }
      return true;
    });
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
    mutationFn: () => triggerScan(buildConfig(filters)),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['event-results'] });
      setMsg(`Scan complete — ${d.found ?? 0} stocks with signals found.`);
    },
    onError: (e: any) => setMsg(`Error: ${e.message}`),
  });

  const allResults: EventResult[] = (data?.results ?? []).sort((a: EventResult, b: EventResult) => {
    const aDate = a.recent_signals?.at(-1)?.date ?? '';
    const bDate = b.recent_signals?.at(-1)?.date ?? '';
    return bDate.localeCompare(aDate);
  });

  const results    = applyFilters(allResults, filters);
  const freshCount = results.filter(r => {
    const d = r.recent_signals?.at(-1)?.date ?? '';
    const cutoff = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    return d >= cutoff;
  }).length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-primary tracking-tight">Event Scanner</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Post-event dip finder · Gap + volume triggers · 9–12mo options · 60 large-caps
          </p>
        </div>
        <div className="flex items-center gap-4">
          {freshCount > 0 && (
            <div className="flex items-center gap-1.5 text-red-400 text-sm font-semibold">
              <Zap size={13} />
              {freshCount} fresh signal{freshCount !== 1 ? 's' : ''}
            </div>
          )}
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
          Fetching 2 years of bars for 60 large-caps and detecting events — takes 2–4 min.
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
              {' '}stocks with events in last {filters.recentBars} days
            </span>
            {freshCount > 0 && (
              <span className="text-red-400 font-semibold">
                {freshCount} within past 7 days
              </span>
            )}
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
              Click "Run Scan" to detect gap + volume events across 60 large-caps.
            </p>
          </div>
        )}

        {!isLoading && !error && allResults.length > 0 && results.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">
            No results match the current filter settings — try loosening the thresholds.
          </div>
        )}

        {results.map(r => <EventRow key={r.id} result={r} filters={filters} />)}
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
