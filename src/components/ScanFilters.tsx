import { cn } from '../lib/utils';

export interface FilterState {
  minCapB:     string;
  minVolM:     string;
  aboveSma200: string;
  rsiMin:      string;
  rsiMax:      string;
  minDrop:     string;
  minRelVol:   string;
  highRange:   string;
}

export const DEFAULT_FILTERS: FilterState = {
  minCapB:     '10',
  minVolM:     '1',
  aboveSma200: 'yes',
  rsiMin:      '30',
  rsiMax:      '45',
  minDrop:     '3',
  minRelVol:   '1.5',
  highRange:   'any',
};

const selectClass =
  'bg-muted border border-border rounded px-2 py-1.5 text-xs text-foreground ' +
  'focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer';

interface Props {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  onReset: () => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground uppercase tracking-wider">{label}</span>
      {children}
    </label>
  );
}

export default function ScanFilters({ filters, onChange, onReset }: Props) {
  const set = (key: keyof FilterState) => (e: React.ChangeEvent<HTMLSelectElement>) =>
    onChange({ ...filters, [key]: e.target.value });

  const isDefault = JSON.stringify(filters) === JSON.stringify(DEFAULT_FILTERS);

  return (
    <div className="bg-muted/20 border border-border rounded-lg px-4 py-3 mb-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Scan Filters
        </span>
        {!isDefault && (
          <button
            onClick={onReset}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            Reset
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-4">
        <Field label="Market Cap">
          <select className={selectClass} value={filters.minCapB} onChange={set('minCapB')}>
            <option value="5">≥ $5B</option>
            <option value="10">≥ $10B</option>
            <option value="25">≥ $25B</option>
            <option value="50">≥ $50B</option>
          </select>
        </Field>

        <Field label="Avg Daily Vol">
          <select className={selectClass} value={filters.minVolM} onChange={set('minVolM')}>
            <option value="0.5">≥ 500K</option>
            <option value="1">≥ 1M</option>
            <option value="2">≥ 2M</option>
            <option value="5">≥ 5M</option>
          </select>
        </Field>

        <Field label="Above 200d SMA">
          <select className={selectClass} value={filters.aboveSma200} onChange={set('aboveSma200')}>
            <option value="yes">Yes</option>
            <option value="any">Any</option>
          </select>
        </Field>

        <Field label="RSI Min">
          <select className={selectClass} value={filters.rsiMin} onChange={set('rsiMin')}>
            <option value="25">≥ 25</option>
            <option value="28">≥ 28</option>
            <option value="30">≥ 30</option>
            <option value="32">≥ 32</option>
            <option value="35">≥ 35</option>
          </select>
        </Field>

        <Field label="RSI Max">
          <select className={selectClass} value={filters.rsiMax} onChange={set('rsiMax')}>
            <option value="40">≤ 40</option>
            <option value="42">≤ 42</option>
            <option value="45">≤ 45</option>
            <option value="48">≤ 48</option>
            <option value="50">≤ 50</option>
          </select>
        </Field>

        <Field label="Daily Drop">
          <select className={selectClass} value={filters.minDrop} onChange={set('minDrop')}>
            <option value="2">≤ −2%</option>
            <option value="3">≤ −3%</option>
            <option value="4">≤ −4%</option>
            <option value="5">≤ −5%</option>
          </select>
        </Field>

        <Field label="Rel Volume">
          <select className={selectClass} value={filters.minRelVol} onChange={set('minRelVol')}>
            <option value="1.0">≥ 1.0×</option>
            <option value="1.2">≥ 1.2×</option>
            <option value="1.5">≥ 1.5×</option>
            <option value="2.0">≥ 2.0×</option>
            <option value="2.5">≥ 2.5×</option>
          </select>
        </Field>

        <Field label="52w High Range">
          <select className={selectClass} value={filters.highRange} onChange={set('highRange')}>
            <option value="any">Any</option>
            <option value="yes">−10% to −25%</option>
          </select>
        </Field>
      </div>

      <p className={cn(
        'text-xs mt-3 pt-2 border-t border-border',
        isDefault ? 'text-muted-foreground/60' : 'text-yellow-500',
      )}>
        {isDefault
          ? 'Filters apply instantly to the last scan. Run Scan to refresh market data.'
          : '⚠ Filters changed — results below reflect the last scan with new thresholds applied.'}
      </p>
    </div>
  );
}
