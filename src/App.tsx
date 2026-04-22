import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Tabs from '@radix-ui/react-tabs';
import ResultsTable from './components/ResultsTable';
import FilterPanel, { DEFAULT_FILTERS, type FilterState } from './components/FilterPanel';
import SmaTab from './components/SmaTab';
import { Loader2, RefreshCw, AlertTriangle } from 'lucide-react';

const queryClient = new QueryClient();

async function fetchResults() {
  const r = await fetch('/api/results');
  if (!r.ok) throw new Error('Failed to load results');
  return r.json();
}

async function triggerScan(config: object) {
  const r = await fetch('/api/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config }),
  });
  const data = await r.json().catch(() => ({ error: `HTTP ${r.status} — empty response` }));
  if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
  return data;
}

function buildScanConfig(f: FilterState) {
  const dteMap: Record<string, { minDte: number; maxDte: number }> = {
    'any':   { minDte: 274, maxDte: 900 },
    '9-12':  { minDte: 274, maxDte: 364 },
    '12-18': { minDte: 365, maxDte: 548 },
    '18-24': { minDte: 548, maxDte: 730 },
    '24-30': { minDte: 730, maxDte: 900 },
  };
  const dipSeverityPct: Record<string, number> = {
    'any': 15, '15-20': 15, '20-30': 20, '30+': 30,
  };
  return {
    options: { ...dteMap[f.dte], minOpenInterest: parseInt(f.minOI) },
    dip: { highDropPct: dipSeverityPct[f.dipSeverity] },
    dipTypeFilter: f.dipType,
  };
}

function applyDisplayFilters(results: any[], f: FilterState): any[] {
  return results.filter(r => {
    // Market cap
    if (f.marketCap === '50-100'  && !(r.market_cap_b >= 50  && r.market_cap_b < 100)) return false;
    if (f.marketCap === '100-200' && !(r.market_cap_b >= 100 && r.market_cap_b < 200)) return false;
    if (f.marketCap === '200+'    && r.market_cap_b < 200) return false;

    // DTE
    if (f.dte === '9-12'  && !(r.dte >= 274 && r.dte < 365)) return false;
    if (f.dte === '12-18' && !(r.dte >= 365 && r.dte < 548)) return false;
    if (f.dte === '18-24' && !(r.dte >= 548 && r.dte < 730)) return false;
    if (f.dte === '24-30' && !(r.dte >= 730))                 return false;

    // Delta approximated from strike / current_price
    const sr = r.current_price > 0 ? r.strike / r.current_price : 1;
    if (f.delta === 'deep-itm'     && sr >= 0.93)               return false;
    if (f.delta === 'near-atm'     && !(sr >= 0.93 && sr < 1.07)) return false;
    if (f.delta === 'slightly-otm' && sr < 1.07)                return false;

    // Dip type
    if (f.dipType === 'earnings_only'  && !r.trigger_earnings_gap) return false;
    if (f.dipType === 'any_single_day' && !r.trigger_earnings_gap && !r.trigger_single_day) return false;

    // Dip severity (drop_from_high_pct is negative)
    const fromHigh = r.drop_from_high_pct ?? 0;
    if (f.dipSeverity === '15-20' && !(fromHigh <= -15 && fromHigh > -20)) return false;
    if (f.dipSeverity === '20-30' && !(fromHigh <= -20 && fromHigh > -30)) return false;
    if (f.dipSeverity === '30+'   && fromHigh > -30)                        return false;

    // Single-day drop (drop_1day_pct is negative)
    const d1 = r.drop_1day_pct ?? 0;
    if (f.singleDay === '8-12'  && !(d1 <= -8  && d1 > -12)) return false;
    if (f.singleDay === '12-18' && !(d1 <= -12 && d1 > -18)) return false;
    if (f.singleDay === '18+'   && d1 > -18)                  return false;

    // Open interest
    if (r.open_interest < parseInt(f.minOI)) return false;

    // IV (iv_current is decimal: 0.30 = 30%)
    const iv = r.iv_current;
    if (f.iv === 'very-low' && (iv == null || iv >= 0.20))          return false;
    if (f.iv === 'low'      && (iv == null || iv < 0.20 || iv >= 0.35)) return false;
    if (f.iv === 'moderate' && (iv == null || iv < 0.35 || iv >= 0.50)) return false;

    return true;
  });
}

const tabTriggerClass =
  'px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground ' +
  'data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary ' +
  'focus-visible:outline-none';

function LeapsTab() {
  const qc = useQueryClient();
  const [msg, setMsg] = useState('');
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  const { data, isLoading, error } = useQuery({
    queryKey: ['results'],
    queryFn: fetchResults,
    refetchInterval: 60000,
  });

  const scan = useMutation({
    mutationFn: () => triggerScan(buildScanConfig(filters)),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['results'] });
      setMsg(`Scan complete! ${d.resultsFound ?? 0} results found.`);
    },
    onError: (e: any) => setMsg(`Error: ${e.message}`),
  });

  const allResults = data?.results ?? [];
  const results = applyDisplayFilters(allResults, filters);
  const priorityCount = results.filter((r: any) => r.priority_alert).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          {priorityCount > 0 && (
            <div className="flex items-center gap-1.5 text-yellow-400 text-sm font-semibold">
              <AlertTriangle size={14} />
              {priorityCount} Priority Alert{priorityCount !== 1 ? 's' : ''}
            </div>
          )}
        </div>
        <button
          onClick={() => { setMsg(''); scan.mutate(); }}
          disabled={scan.isPending}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {scan.isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {scan.isPending ? 'Scanning...' : 'Run Scan'}
        </button>
      </div>

      {scan.isPending && (
        <div className="mb-4 p-3 bg-muted rounded text-xs text-muted-foreground">
          Scan running — analyzing {'>'}60 large-cap stocks for dip setups + LEAP contracts. Takes 2–4 min.
        </div>
      )}
      {msg && !scan.isPending && (
        <div className="mb-4 p-3 bg-muted rounded text-xs text-muted-foreground">{msg}</div>
      )}

      <FilterPanel
        filters={filters}
        onChange={setFilters}
        onReset={() => setFilters(DEFAULT_FILTERS)}
      />
      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 size={16} className="animate-spin" /> Loading results...
        </div>
      )}
      {error && <p className="text-destructive text-sm">Failed to load results.</p>}
      {!isLoading && !error && (
        <ResultsTable results={results} totalCount={allResults.length} />
      )}
    </div>
  );
}

function Scanner() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-4">
        <h1 className="text-xl font-bold text-primary tracking-tight">LEAPS Scanner</h1>
        <p className="text-xs text-muted-foreground">Post-dip opportunity scanner · Large-cap stocks</p>
      </header>

      <main className="p-6">
        <Tabs.Root defaultValue="leaps">
          <Tabs.List className="flex border-b border-border mb-6 -mx-6 px-6">
            <Tabs.Trigger value="leaps" className={tabTriggerClass}>
              LEAP Dips
            </Tabs.Trigger>
            <Tabs.Trigger value="sma" className={tabTriggerClass}>
              10% Below 20 SMA
            </Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="leaps">
            <LeapsTab />
          </Tabs.Content>
          <Tabs.Content value="sma">
            <SmaTab />
          </Tabs.Content>
        </Tabs.Root>
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
