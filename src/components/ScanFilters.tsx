import { cn } from '../lib/utils';

export interface FilterState {
  gapPct: string;
  volRatio: string;
  highDropPct: string;
  signalType: string;
  recentBars: string;
}

export const DEFAULT_FILTERS: FilterState = {
  gapPct:      '5',
  volRatio:    '1.3',
  highDropPct: '8',
  signalType:  'any',
  recentBars:  '90',
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
          Scan Settings
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
        <Field label="Min Drop %">
          <select className={selectClass} value={filters.gapPct} onChange={set('gapPct')}>
            <option value="3">≥ 3%</option>
            <option value="4">≥ 4%</option>
            <option value="5">≥ 5%</option>
            <option value="6">≥ 6%</option>
            <option value="7">≥ 7%</option>
            <option value="8">≥ 8%</option>
            <option value="10">≥ 10%</option>
          </select>
        </Field>

        <Field label="Volume Spike">
          <select className={selectClass} value={filters.volRatio} onChange={set('volRatio')}>
            <option value="1.0">Any (≥ 1×)</option>
            <option value="1.2">≥ 1.2×</option>
            <option value="1.3">≥ 1.3×</option>
            <option value="1.5">≥ 1.5×</option>
            <option value="2.0">≥ 2.0×</option>
          </select>
        </Field>

        <Field label="Drop from 20d High">
          <select className={selectClass} value={filters.highDropPct} onChange={set('highDropPct')}>
            <option value="5">≥ 5%</option>
            <option value="6">≥ 6%</option>
            <option value="7">≥ 7%</option>
            <option value="8">≥ 8%</option>
            <option value="10">≥ 10%</option>
            <option value="12">≥ 12%</option>
            <option value="15">≥ 15%</option>
          </select>
        </Field>

        <Field label="Signal Type">
          <select className={selectClass} value={filters.signalType} onChange={set('signalType')}>
            <option value="any">Any</option>
            <option value="gap_volume">Gap + Volume only</option>
            <option value="high_drop">High-Drop only</option>
          </select>
        </Field>

        <Field label="Lookback">
          <select className={selectClass} value={filters.recentBars} onChange={set('recentBars')}>
            <option value="30">30 days</option>
            <option value="60">60 days</option>
            <option value="90">90 days</option>
            <option value="120">120 days</option>
          </select>
        </Field>
      </div>

      <p className={cn(
        'text-xs mt-3 pt-2 border-t border-border',
        isDefault ? 'text-muted-foreground/60' : 'text-yellow-500',
      )}>
        {isDefault
          ? 'Settings apply to the next scan and filter displayed results.'
          : '⚠ Settings changed — click Run Scan to re-scan with new thresholds, or results below are filtered from the last scan.'}
      </p>
    </div>
  );
}
