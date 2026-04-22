import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Loader2, RefreshCw, Zap } from 'lucide-react';
import EventRow, { type EventResult } from './components/EventRow';

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

function Scanner() {
  const qc = useQueryClient();
  const [msg, setMsg] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['event-results'],
    queryFn: fetchResults,
    refetchInterval: 60000,
  });

  const scan = useMutation({
    mutationFn: triggerScan,
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['event-results'] });
      setMsg(`Scan complete — ${d.found ?? 0} stocks with signals found.`);
    },
    onError: (e: any) => setMsg(`Error: ${e.message}`),
  });

  const results: EventResult[] = (data?.results ?? []).sort((a: EventResult, b: EventResult) => {
    const aDate = a.recent_signals?.at(-1)?.date ?? '';
    const bDate = b.recent_signals?.at(-1)?.date ?? '';
    return bDate.localeCompare(aDate);
  });

  const freshCount = results.filter(r => {
    const d = r.recent_signals?.at(-1)?.date ?? '';
    return d >= new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
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
          Fetching 2 years of price data for 60 large-caps and detecting gap/volume events — takes 2–4 min.
        </div>
      )}
      {msg && !scan.isPending && (
        <div className="mx-6 mt-4 p-3 bg-muted rounded text-xs text-muted-foreground">{msg}</div>
      )}

      <main className="px-6 py-5 max-w-5xl mx-auto">
        {/* Summary bar */}
        {!isLoading && !error && results.length > 0 && (
          <div className="flex items-center gap-4 mb-5 text-xs text-muted-foreground">
            <span>
              <span className="text-foreground font-semibold">{results.length}</span> stocks with events in last 90 days
            </span>
            {freshCount > 0 && (
              <span className="text-red-400 font-semibold">
                {freshCount} triggered within 7 days
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

        {!isLoading && !error && results.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-base">No events found in the last 90 days.</p>
            <p className="text-sm mt-1">Click "Run Scan" to scan for gap + volume events across 60 large-caps.</p>
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
