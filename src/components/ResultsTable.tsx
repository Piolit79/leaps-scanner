import { AlertTriangle, Eye } from 'lucide-react';
import { cn, fmt, pct } from '../lib/utils';

interface Result {
  id: string;
  ticker: string;
  company_name: string;
  market_cap_b: number;
  current_price: number;
  pre_dip_price: number;
  trigger_earnings_gap: boolean;
  trigger_single_day: boolean;
  trigger_high_drop: boolean;
  trigger_rolling: boolean;
  drop_1day_pct: number;
  drop_from_high_pct: number;
  drop_30day_pct: number;
  dip_date: string;
  contract_symbol: string;
  strike: number;
  expiry: string;
  dte: number;
  contract_price: number;
  contract_low_alltime: number;
  pct_above_low: number;
  open_interest: number;
  iv_rank: number | null;
  score: number;
  score_breakdown: Record<string, number>;
  priority_alert: boolean;
  manual_review: boolean;
  pre_dip_above_sma: boolean;
}

function Trigger({ label, active }: { label: string; active: boolean }) {
  if (!active) return null;
  return (
    <span className="inline-block bg-yellow-900 text-yellow-300 text-xs px-1.5 py-0.5 rounded mr-1">
      {label}
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min((score / 16) * 100, 100);
  const color = score >= 10 ? 'bg-green-500' : score >= 8 ? 'bg-yellow-500' : 'bg-blue-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 bg-muted rounded-full h-1.5">
        <div className={cn('h-1.5 rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-bold">{score}/16</span>
    </div>
  );
}

export default function ResultsTable({ results }: { results: Result[] }) {
  if (!results.length) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p className="text-lg">No results yet.</p>
        <p className="text-sm mt-1">Click "Run Scan" to find LEAP opportunities.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="text-xs text-muted-foreground mb-3">{results.length} result{results.length !== 1 ? 's' : ''}</div>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-border text-muted-foreground text-left">
            <th className="py-2 pr-4">Ticker</th>
            <th className="py-2 pr-4">Triggers</th>
            <th className="py-2 pr-4">1-Day Drop</th>
            <th className="py-2 pr-4">From High</th>
            <th className="py-2 pr-4">Dip Date</th>
            <th className="py-2 pr-4">Contract</th>
            <th className="py-2 pr-4">Price</th>
            <th className="py-2 pr-4">All-Time Low</th>
            <th className="py-2 pr-4">% Above Low</th>
            <th className="py-2 pr-4">OI</th>
            <th className="py-2 pr-4">IV Rank</th>
            <th className="py-2 pr-4">Score</th>
          </tr>
        </thead>
        <tbody>
          {results.map(r => (
            <tr
              key={r.id}
              className={cn(
                'border-b border-border hover:bg-accent transition-colors',
                r.priority_alert && 'bg-yellow-950/30',
                r.manual_review && 'opacity-60',
              )}
            >
              <td className="py-2.5 pr-4">
                <div className="flex items-center gap-1.5">
                  {r.priority_alert && <AlertTriangle size={12} className="text-yellow-400 shrink-0" />}
                  {r.manual_review && <Eye size={12} className="text-blue-400 shrink-0" />}
                  <div>
                    <div className="font-bold text-foreground">{r.ticker}</div>
                    <div className="text-muted-foreground truncate max-w-[120px]">{r.company_name}</div>
                  </div>
                </div>
              </td>
              <td className="py-2.5 pr-4">
                <Trigger label="EPS Gap" active={r.trigger_earnings_gap} />
                <Trigger label="1-Day" active={r.trigger_single_day} />
                <Trigger label="52w High" active={r.trigger_high_drop} />
                <Trigger label="30-Day" active={r.trigger_rolling} />
              </td>
              <td className={cn('py-2.5 pr-4', r.drop_1day_pct < -5 ? 'text-red-400' : 'text-muted-foreground')}>
                {r.drop_1day_pct != null ? pct(r.drop_1day_pct / 100) : '—'}
              </td>
              <td className="py-2.5 pr-4 text-red-400">
                {r.drop_from_high_pct != null ? pct(r.drop_from_high_pct / 100) : '—'}
              </td>
              <td className="py-2.5 pr-4 text-muted-foreground">{r.dip_date ?? '—'}</td>
              <td className="py-2.5 pr-4">
                <div className="font-mono text-foreground">{r.contract_symbol}</div>
                <div className="text-muted-foreground">Strike ${fmt(r.strike, 0)} · {r.dte}d</div>
              </td>
              <td className="py-2.5 pr-4 font-semibold">${fmt(r.contract_price)}</td>
              <td className="py-2.5 pr-4 text-muted-foreground">${fmt(r.contract_low_alltime)}</td>
              <td className={cn('py-2.5 pr-4 font-semibold', r.pct_above_low <= 10 ? 'text-green-400' : 'text-yellow-400')}>
                +{fmt(r.pct_above_low)}%
              </td>
              <td className="py-2.5 pr-4">{r.open_interest?.toLocaleString()}</td>
              <td className="py-2.5 pr-4">
                {r.iv_rank != null ? (
                  <span className={r.iv_rank < 30 ? 'text-green-400' : 'text-muted-foreground'}>
                    {fmt(r.iv_rank, 0)}
                  </span>
                ) : '—'}
              </td>
              <td className="py-2.5 pr-4">
                <ScoreBar score={r.score} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
