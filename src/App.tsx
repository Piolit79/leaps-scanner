import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ResultsTable from './components/ResultsTable';
import { Loader2, RefreshCw, AlertTriangle } from 'lucide-react';

const queryClient = new QueryClient();

async function fetchResults() {
  const r = await fetch('/api/results');
  if (!r.ok) throw new Error('Failed to load results');
  return r.json();
}

async function triggerScan() {
  const r = await fetch('/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  if (!r.ok) throw new Error('Scan failed');
  return r.json();
}

function Scanner() {
  const qc = useQueryClient();
  const [msg, setMsg] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['results'],
    queryFn: fetchResults,
    refetchInterval: 60000,
  });

  const scan = useMutation({
    mutationFn: triggerScan,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['results'] }); setMsg('Scan complete!'); },
    onError: (e: any) => setMsg(`Error: ${e.message}`),
  });

  const results = data?.results ?? [];
  const priorityCount = results.filter((r: any) => r.priority_alert).length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-primary tracking-tight">LEAPS Scanner</h1>
          <p className="text-xs text-muted-foreground">Post-dip LEAP opportunity scanner · Calls only · 365–900 DTE</p>
        </div>
        <div className="flex items-center gap-4">
          {priorityCount > 0 && (
            <div className="flex items-center gap-1.5 text-yellow-400 text-sm font-semibold">
              <AlertTriangle size={14} />
              {priorityCount} Priority Alert{priorityCount !== 1 ? 's' : ''}
            </div>
          )}
          <button
            onClick={() => { setMsg(''); scan.mutate(); }}
            disabled={scan.isPending}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {scan.isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {scan.isPending ? 'Scanning...' : 'Run Scan'}
          </button>
        </div>
      </header>

      {scan.isPending && (
        <div className="mx-6 mt-4 p-3 bg-muted rounded text-xs text-muted-foreground">
          Scan running — analyzing {'>'}70 large-cap stocks for dip setups + LEAP contracts. Takes 3–5 min.
        </div>
      )}
      {msg && !scan.isPending && (
        <div className="mx-6 mt-4 p-3 bg-muted rounded text-xs text-muted-foreground">{msg}</div>
      )}

      <main className="p-6">
        {isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 size={16} className="animate-spin" /> Loading results...
          </div>
        )}
        {error && <p className="text-destructive text-sm">Failed to load results.</p>}
        {!isLoading && !error && <ResultsTable results={results} />}
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
