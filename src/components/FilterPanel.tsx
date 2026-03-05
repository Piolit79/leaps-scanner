import type { Dispatch, SetStateAction } from 'react';

export interface FilterState {
  marketCap: 'any' | '50-100' | '100-200' | '200+';
  dte: 'any' | '12-18' | '18-24' | '24-30';
  delta: 'any' | 'deep-itm' | 'near-atm' | 'slightly-otm';
  dipType: 'any' | 'earnings_only' | 'any_single_day';
  dipSeverity: 'any' | '15-20' | '20-30' | '30+';
  singleDay: 'any' | '8-12' | '12-18' | '18+';
  minOI: '500' | '1000' | '2500';
  iv: 'any' | 'very-low' | 'low' | 'moderate';
}

export const DEFAULT_FILTERS: FilterState = {
  marketCap: 'any',
  dte: 'any',
  delta: 'any',
  dipType: 'any',
  dipSeverity: 'any',
  singleDay: 'any',
  minOI: '500',
  iv: 'any',
};

function Sel({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
        {label}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-muted border border-border text-foreground text-xs rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary w-full"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

interface Props {
  filters: FilterState;
  onChange: Dispatch<SetStateAction<FilterState>>;
  onReset: () => void;
}

export default function FilterPanel({ filters, onChange, onReset }: Props) {
  const set = (key: keyof FilterState) => (v: string) =>
    onChange(prev => ({ ...prev, [key]: v as any }));

  const isDefault =
    filters.marketCap === 'any' && filters.dte === 'any' && filters.delta === 'any' &&
    filters.dipType === 'any' && filters.dipSeverity === 'any' && filters.singleDay === 'any' &&
    filters.minOI === '500' && filters.iv === 'any';

  return (
    <div className="border border-border rounded p-3 mb-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Filters
        </span>
        {!isDefault && (
          <button
            onClick={onReset}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Reset
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Sel label="Market Cap" value={filters.marketCap} onChange={set('marketCap')} options={[
          { value: 'any', label: '$50B+ (All)' },
          { value: '50-100', label: '$50B – $100B' },
          { value: '100-200', label: '$100B – $200B' },
          { value: '200+', label: '$200B+ Mega' },
        ]} />
        <Sel label="DTE" value={filters.dte} onChange={set('dte')} options={[
          { value: 'any', label: 'Any LEAP (12–30m)' },
          { value: '12-18', label: '12 – 18 months' },
          { value: '18-24', label: '18 – 24 months' },
          { value: '24-30', label: '24 – 30 months' },
        ]} />
        <Sel label="Delta (approx.)" value={filters.delta} onChange={set('delta')} options={[
          { value: 'any', label: 'Any' },
          { value: 'deep-itm', label: '0.60–0.80 Deep ITM' },
          { value: 'near-atm', label: '0.40–0.60 Near ATM' },
          { value: 'slightly-otm', label: '0.25–0.40 Slight OTM' },
        ]} />
        <Sel label="Dip Type" value={filters.dipType} onChange={set('dipType')} options={[
          { value: 'any', label: 'Any trigger' },
          { value: 'earnings_only', label: 'Earnings gap only' },
          { value: 'any_single_day', label: 'Any single-day drop' },
        ]} />
        <Sel label="Dip Severity" value={filters.dipSeverity} onChange={set('dipSeverity')} options={[
          { value: 'any', label: 'Any (15%+)' },
          { value: '15-20', label: '15 – 20% off high' },
          { value: '20-30', label: '20 – 30% off high' },
          { value: '30+', label: '30%+ off high' },
        ]} />
        <Sel label="1-Day Drop" value={filters.singleDay} onChange={set('singleDay')} options={[
          { value: 'any', label: 'Any' },
          { value: '8-12', label: '8 – 12%' },
          { value: '12-18', label: '12 – 18%' },
          { value: '18+', label: '18%+' },
        ]} />
        <Sel label="Open Interest" value={filters.minOI} onChange={set('minOI')} options={[
          { value: '500', label: '500+' },
          { value: '1000', label: '1,000+' },
          { value: '2500', label: '2,500+' },
        ]} />
        <Sel label="IV Level" value={filters.iv} onChange={set('iv')} options={[
          { value: 'any', label: 'Any' },
          { value: 'very-low', label: 'Very Low (<20%)' },
          { value: 'low', label: 'Low (20–35%)' },
          { value: 'moderate', label: 'Moderate (35–50%)' },
        ]} />
      </div>
    </div>
  );
}
