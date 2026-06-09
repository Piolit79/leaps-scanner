import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw, Plus, ChevronDown, ChevronUp, X, Check } from 'lucide-react';
import { cn, fmt } from '../lib/utils';

// ── Types ────────────────────────────────────────────────────────────────────

type SignalAction = 'HOLD_STRONG' | 'HOLD' | 'WATCH' | 'TRIM' | 'EXIT' | 'ROLL' | 'RECOVER_COST';

interface PositionAxes { trend: number; time: number; structure: number; momentum: number }
interface PositionScore { axes: PositionAxes; total: number; action: SignalAction; reasons: string[] }
interface LiveData {
  underlyingPrice: number;
  underlyingDayChangePct: number;
  optionMark: number | null;
  rsi14: number;
  sma200: number;
  high52w: number;
  dte: number;
  pctFromStrike: number;
  pctFrom52wHigh: number;
  pctAboveSma200: number;
}
interface Position {
  id: string;
  ticker: string;
  strike: number;
  expiry_date: string;
  quantity: number;
  avg_cost: number;
  entry_date: string;
  notes?: string | null;
  is_active: boolean;
  created_at: string;
  live?: LiveData | null;
  score?: PositionScore | null;
  pnlPct?: number | null;
  pnlDollars?: number | null;
  currentMark?: number | null;
}

// ── Formatting ───────────────────────────────────────────────────────────────

function fmtPrice(n: number) {
  return `$${fmt(n, 2)}`;
}

function fmtPct(n: number, showSign = true) {
  const sign = showSign && n >= 0 ? '+' : '';
  return `${sign}${fmt(n, 1)}%`;
}

function fmtDollars(n: number) {
  const abs = Math.abs(n);
  const sign = n >= 0 ? '+' : '-';
  if (abs >= 1_000_000) return `${sign}$${fmt(abs / 1_000_000, 2)}M`;
  if (abs >= 1_000) return `${sign}$${fmt(abs / 1_000, 1)}K`;
  return `${sign}$${fmt(abs, 0)}`;
}

function fmtExpiry(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

// ── Signal config ─────────────────────────────────────────────────────────────

const ACTION_STYLE: Record<SignalAction, { label: string; cls: string }> = {
  HOLD_STRONG:  { label: 'HOLD STRONG',  cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40' },
  HOLD:         { label: 'HOLD',         cls: 'bg-blue-500/15 text-blue-400 border-blue-500/40' },
  WATCH:        { label: 'WATCH',        cls: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/40' },
  TRIM:         { label: 'TRIM',         cls: 'bg-orange-500/15 text-orange-400 border-orange-500/40' },
  EXIT:         { label: 'EXIT',         cls: 'bg-red-500/15 text-red-400 border-red-500/40' },
  ROLL:         { label: 'ROLL ↑',       cls: 'bg-purple-500/15 text-purple-400 border-purple-500/40' },
  RECOVER_COST: { label: 'RECOVER COST', cls: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/40' },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function ScoreAxis({ label, value }: { label: string; value: number }) {
  const pct = ((value + 3) / 6) * 100;
  const color = value > 0 ? 'bg-emerald-500' : value < 0 ? 'bg-red-500' : 'bg-yellow-500';
  const textColor = value > 0 ? 'text-emerald-400' : value < 0 ? 'text-red-400' : 'text-yellow-400';
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground w-20 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[80px]">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className={cn('font-mono w-5 text-right', textColor)}>
        {value > 0 ? '+' : ''}{value}
      </span>
    </div>
  );
}

function PositionCard({
  pos,
  onClose,
}: {
  pos: Position;
  onClose: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const live = pos.live;
  const score = pos.score;
  const action = score?.action ?? 'HOLD';
  const style = ACTION_STYLE[action];

  const hasPnl = pos.pnlPct !== null && pos.pnlPct !== undefined;
  const pnlPos = hasPnl && (pos.pnlPct ?? 0) >= 0;
  const totalCostBasis = pos.avg_cost * pos.quantity * 100;

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      {/* Card header */}
      <div className="px-4 py-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Signal badge */}
          <span className={cn(
            'text-[10px] font-bold tracking-widest px-2 py-0.5 rounded border',
            style.cls,
          )}>
            {style.label}
          </span>

          {/* Contract identity */}
          <div>
            <span className="font-bold text-foreground">{pos.ticker}</span>
            <span className="text-muted-foreground text-sm ml-2">
              ${fmt(pos.strike, 0)}C · {fmtExpiry(pos.expiry_date)}
              {live && (
            <span className={cn('ml-2 text-xs', live.dte === 0 ? 'text-red-400 font-semibold' : '')}>
              {live.dte === 0 ? '⚠ Check expiry date' : `${live.dte}d left`}
            </span>
          )}
            </span>
          </div>
        </div>

        {/* Close button */}
        <div className="flex items-center gap-1 shrink-0">
          {confirming ? (
            <>
              <button
                onClick={() => { onClose(pos.id); setConfirming(false); }}
                className="flex items-center gap-1 text-xs text-red-400 border border-red-500/40 bg-red-500/10 rounded px-2 py-1 hover:bg-red-500/20 transition-colors"
              >
                <Check size={10} /> Close
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="text-xs text-muted-foreground border border-border rounded px-2 py-1 hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="text-muted-foreground hover:text-foreground transition-colors p-1"
              title="Close position"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Live data row */}
      {live && (
        <div className="px-4 pb-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          {/* Left col: underlying */}
          <div className="space-y-1">
            <div className="flex items-baseline gap-2">
              <span className="text-foreground font-semibold">{fmtPrice(live.underlyingPrice)}</span>
              <span className={cn(
                'text-xs',
                live.underlyingDayChangePct >= 0 ? 'text-emerald-400' : 'text-red-400',
              )}>
                {fmtPct(live.underlyingDayChangePct)} today
              </span>
            </div>
            <div className="text-xs text-muted-foreground space-x-3">
              <span className={live.pctAboveSma200 >= 0 ? 'text-emerald-400/80' : 'text-red-400/80'}>
                {live.pctAboveSma200 >= 0 ? '↑' : '↓'} SMA200 {fmtPct(live.pctAboveSma200)}
              </span>
              <span>RSI {fmt(live.rsi14, 0)}</span>
              <span className="text-muted-foreground/60">{fmtPct(live.pctFrom52wHigh)} 52wH</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Strike {live.pctFromStrike >= 0
                ? <span className="text-emerald-400/80">ITM {fmtPct(Math.abs(live.pctFromStrike))}</span>
                : <span>OTM {fmtPct(Math.abs(live.pctFromStrike), false)}</span>
              }
            </div>
          </div>

          {/* Right col: position P&L */}
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">
              {pos.quantity} contracts × {fmtPrice(pos.avg_cost)} avg
            </div>
            {pos.currentMark !== null && pos.currentMark !== undefined && (
              <div className="text-xs text-muted-foreground">
                Mark: <span className="text-foreground font-medium">{fmtPrice(pos.currentMark)}</span>
                <span className="ml-2 text-muted-foreground/60">
                  Basis: ${fmt(totalCostBasis, 0)}
                </span>
              </div>
            )}
            {hasPnl ? (
              <div className={cn(
                'font-semibold text-sm',
                pnlPos ? 'text-emerald-400' : 'text-red-400',
              )}>
                {fmtDollars(pos.pnlDollars ?? 0)}
                <span className="text-xs font-normal ml-2">
                  ({fmtPct(pos.pnlPct ?? 0)})
                </span>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">P&L: no option data</div>
            )}
          </div>
        </div>
      )}

      {/* No live data fallback */}
      {!live && (
        <div className="px-4 pb-3 text-xs text-muted-foreground">
          {pos.quantity} contracts × {fmtPrice(pos.avg_cost)} avg ·
          expires {fmtExpiry(pos.expiry_date)} · loading live data…
        </div>
      )}

      {/* Score bar */}
      {score && (
        <div className="border-t border-border px-4 py-2">
          <button
            onClick={() => setExpanded(v => !v)}
            className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <div className="flex items-center gap-3">
              <span>Score</span>
              <div className="flex items-center gap-2">
                {(['trend', 'time', 'structure', 'momentum'] as const).map(axis => (
                  <span key={axis} className={cn(
                    'font-mono',
                    score.axes[axis] > 0 ? 'text-emerald-400' : score.axes[axis] < 0 ? 'text-red-400' : 'text-yellow-400',
                  )}>
                    {score.axes[axis] > 0 ? '+' : ''}{score.axes[axis]}
                  </span>
                ))}
                <span className="text-muted-foreground">= </span>
                <span className={cn(
                  'font-bold',
                  score.total >= 7 ? 'text-emerald-400' :
                  score.total >= 4 ? 'text-blue-400' :
                  score.total >= 2 ? 'text-yellow-400' :
                  'text-red-400',
                )}>
                  {score.total}
                </span>
              </div>
            </div>
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>

          {expanded && (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                <ScoreAxis label="Trend" value={score.axes.trend} />
                <ScoreAxis label="Time (DTE)" value={score.axes.time} />
                <ScoreAxis label="Structure" value={score.axes.structure} />
                <ScoreAxis label="Momentum" value={score.axes.momentum} />
              </div>
              <ul className="text-xs text-muted-foreground space-y-0.5 pt-1 border-t border-border/50">
                {score.reasons.map((r, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="mt-0.5 shrink-0">·</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Notes */}
      {pos.notes && (
        <div className="border-t border-border/50 px-4 py-1.5 text-xs text-muted-foreground italic">
          {pos.notes}
        </div>
      )}
    </div>
  );
}

// ── Add form ──────────────────────────────────────────────────────────────────

interface AddFormProps {
  onClose: () => void;
  onSaved: () => void;
}

function AddForm({ onClose, onSaved }: AddFormProps) {
  const [ticker, setTicker]   = useState('');
  const [strike, setStrike]   = useState('');
  const [expiry, setExpiry]   = useState('');
  const [qty, setQty]         = useState('');
  const [cost, setCost]       = useState('');
  const [entryDate, setEntry] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes]     = useState('');
  const [error, setError]     = useState('');
  const [saving, setSaving]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!ticker || !strike || !expiry || !qty || !cost || !entryDate) {
      setError('All fields except notes are required.');
      return;
    }
    setSaving(true);
    try {
      const r = await fetch('/api/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker, strike, expiry_date: expiry, quantity: qty, avg_cost: cost, entry_date: entryDate, notes }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const fieldCls = 'w-full bg-muted border border-border rounded px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary';
  const labelCls = 'block text-xs text-muted-foreground mb-1';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">Add Position</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Ticker *</label>
              <input
                className={fieldCls}
                placeholder="NVDA"
                value={ticker}
                onChange={e => setTicker(e.target.value.toUpperCase())}
                maxLength={6}
              />
            </div>
            <div>
              <label className={labelCls}>Strike $ *</label>
              <input
                className={fieldCls}
                type="number"
                step="0.5"
                min="1"
                placeholder="240"
                value={strike}
                onChange={e => setStrike(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Expiry Date *</label>
              <input
                className={fieldCls}
                type="date"
                value={expiry}
                onChange={e => setExpiry(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Contracts (qty) *</label>
              <input
                className={fieldCls}
                type="number"
                min="1"
                placeholder="9"
                value={qty}
                onChange={e => setQty(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Avg Cost / Contract $ *</label>
              <input
                className={fieldCls}
                type="number"
                step="0.01"
                min="0.01"
                placeholder="18.20"
                value={cost}
                onChange={e => setCost(e.target.value)}
              />
              {cost && <p className="text-[10px] text-muted-foreground mt-1">
                Basis: ${fmt(parseFloat(cost || '0') * parseInt(qty || '0') * 100, 0)}
              </p>}
            </div>
            <div>
              <label className={labelCls}>Entry Date *</label>
              <input
                className={fieldCls}
                type="date"
                value={entryDate}
                onChange={e => setEntry(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Notes (optional)</label>
            <input
              className={fieldCls}
              placeholder="e.g. AI infrastructure play, hold through volatility"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-border text-sm rounded py-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-primary text-primary-foreground text-sm rounded py-2 font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2"
            >
              {saving && <Loader2 size={13} className="animate-spin" />}
              {saving ? 'Adding…' : 'Add Position'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Score legend ─────────────────────────────────────────────────────────────

function ScoreLegend() {
  const signals: { action: SignalAction; score: string; what: string; do: string }[] = [
    { action: 'HOLD_STRONG',  score: '7–10', what: 'Thesis fully intact',          do: 'Do nothing — volatility is noise' },
    { action: 'HOLD',         score: '4–6',  what: 'On track',                     do: 'Monitor but no action needed' },
    { action: 'WATCH',        score: '2–3',  what: 'One more bad thing and you act', do: 'Set a mental stop, stay alert' },
    { action: 'TRIM',         score: '0–1',  what: 'Weakening but not dead',        do: 'Sell partial, hold the core' },
    { action: 'EXIT',         score: '< 0',  what: 'Multiple thesis-breakers',      do: 'Cut the loss, free the capital' },
    { action: 'ROLL',         score: '—',    what: 'Deep ITM + DTE < 90d',          do: 'Capture intrinsic, roll up & out' },
    { action: 'RECOVER_COST', score: '+200%', what: 'Up 200%+ on option',           do: 'Sell enough to cover your cost basis, let rest ride free' },
  ];

  const axes = [
    { label: 'Trend',     range: '-3 → +3', desc: 'Stock above 200d SMA? RSI in healthy range (40–70)?' },
    { label: 'Time',      range: '-3 → +3', desc: 'Days to expiry. >180d = +3, <45d = -3. Theta kills fast.' },
    { label: 'Structure', range: '-3 → +3', desc: 'Option ITM/OTM vs strike. Deep OTM + big loss = penalty.' },
    { label: 'Momentum',  range: '-3 → +3', desc: '% off 52-week high. Within 10% = +2. >40% off = -2.' },
  ];

  return (
    <div className="border border-border rounded-lg bg-card text-xs space-y-0 overflow-hidden">
      {/* Signals */}
      <div className="px-3 py-2.5 border-b border-border bg-muted/30">
        <p className="font-semibold text-foreground text-[11px] uppercase tracking-wider">Signals</p>
      </div>
      <div className="divide-y divide-border/50">
        {signals.map(s => {
          const style = ACTION_STYLE[s.action];
          return (
            <div key={s.action} className="px-3 py-2 flex gap-2.5 items-start">
              <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                <span className={cn('text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded border whitespace-nowrap', style.cls)}>
                  {style.label}
                </span>
                <span className="text-muted-foreground/60 font-mono text-[10px] w-8 shrink-0">{s.score}</span>
              </div>
              <div className="min-w-0">
                <p className="text-foreground/80 leading-tight">{s.what}</p>
                <p className="text-muted-foreground leading-tight mt-0.5">{s.do}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Axes */}
      <div className="px-3 py-2.5 border-t border-b border-border bg-muted/30">
        <p className="font-semibold text-foreground text-[11px] uppercase tracking-wider">Score Axes (each -3 to +3)</p>
      </div>
      <div className="divide-y divide-border/50">
        {axes.map(a => (
          <div key={a.label} className="px-3 py-2">
            <div className="flex items-baseline justify-between mb-0.5">
              <span className="font-medium text-foreground/90">{a.label}</span>
              <span className="font-mono text-muted-foreground/60 text-[10px]">{a.range}</span>
            </div>
            <p className="text-muted-foreground leading-snug">{a.desc}</p>
          </div>
        ))}
      </div>

      {/* Total */}
      <div className="px-3 py-2.5 border-t border-border bg-muted/30">
        <p className="font-semibold text-foreground text-[11px] uppercase tracking-wider mb-1.5">Total Score</p>
        <div className="space-y-1">
          {[
            { range: '7–10', action: 'HOLD_STRONG' as SignalAction },
            { range: '4–6',  action: 'HOLD'        as SignalAction },
            { range: '2–3',  action: 'WATCH'       as SignalAction },
            { range: '0–1',  action: 'TRIM'        as SignalAction },
            { range: '< 0',  action: 'EXIT'        as SignalAction },
          ].map(r => (
            <div key={r.range} className="flex items-center gap-2">
              <span className="font-mono text-muted-foreground w-8 text-right shrink-0">{r.range}</span>
              <span className={cn('text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded border', ACTION_STYLE[r.action].cls)}>
                {ACTION_STYLE[r.action].label}
              </span>
            </div>
          ))}
        </div>
        <p className="text-muted-foreground mt-2 leading-snug">
          ROLL and RECOVER COST override score — triggered by structure rules regardless of total.
        </p>
      </div>
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

async function fetchLive(): Promise<{ positions: Position[]; refreshed_at: string }> {
  const r = await fetch('/api/portfolio-live', { method: 'POST' });
  if (!r.ok) throw new Error('Failed to load portfolio');
  return r.json();
}

async function deletePosition(id: string) {
  const r = await fetch(`/api/portfolio?id=${id}`, { method: 'DELETE' });
  if (!r.ok) throw new Error('Failed to close position');
}

export default function PortfolioTab() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['portfolio-live'],
    queryFn: fetchLive,
    refetchInterval: 5 * 60 * 1000, // auto-refresh every 5 min
    staleTime: 60 * 1000,
  });

  const close = useMutation({
    mutationFn: deletePosition,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portfolio-live'] }),
  });

  const positions: Position[] = data?.positions ?? [];

  // Summary stats
  const pnlPositions = positions.filter(p => p.pnlDollars !== null && p.pnlDollars !== undefined);
  const totalPnlDollars = pnlPositions.reduce((s, p) => s + (p.pnlDollars ?? 0), 0);
  const totalBasis = positions.reduce((s, p) => s + p.avg_cost * p.quantity * 100, 0);
  const totalPnlPct = totalBasis > 0 ? (totalPnlDollars / totalBasis) * 100 : 0;

  // Sort: EXIT/TRIM first (attention needed), then HOLD_STRONG last
  const ORDER: Record<SignalAction, number> = {
    EXIT: 0, TRIM: 1, WATCH: 2, ROLL: 3, RECOVER_COST: 4, HOLD: 5, HOLD_STRONG: 6,
  };
  const sorted = [...positions].sort((a, b) => {
    const aO = ORDER[a.score?.action ?? 'HOLD'];
    const bO = ORDER[b.score?.action ?? 'HOLD'];
    return aO - bO;
  });

  function handleSaved() {
    setShowAdd(false);
    qc.invalidateQueries({ queryKey: ['portfolio-live'] });
  }

  const refreshedAt = data?.refreshed_at
    ? new Date(data.refreshed_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <>
      {showAdd && <AddForm onClose={() => setShowAdd(false)} onSaved={handleSaved} />}

      {/* Top bar */}
      <div className="border-b border-border px-6 py-3 flex items-center justify-between">
        <div>
          {positions.length > 0 ? (
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">{positions.length} position{positions.length !== 1 ? 's' : ''}</span>
              {pnlPositions.length > 0 && (
                <span className={cn(
                  'font-semibold',
                  totalPnlDollars >= 0 ? 'text-emerald-400' : 'text-red-400',
                )}>
                  {fmtDollars(totalPnlDollars)}
                  <span className="font-normal text-xs ml-1.5">({fmtPct(totalPnlPct)})</span>
                </span>
              )}
              {refreshedAt && (
                <span className="text-xs text-muted-foreground">as of {refreshedAt}</span>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Track your LEAPS positions with hold/sell signals</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ['portfolio-live'] })}
            disabled={isFetching}
            className="flex items-center gap-1.5 text-sm border border-border rounded px-3 py-1.5 text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
          >
            <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground text-sm rounded px-3 py-1.5 font-semibold hover:opacity-90 transition-opacity"
          >
            <Plus size={14} /> Add Position
          </button>
        </div>
      </div>

      <main className="px-6 py-5 max-w-7xl mx-auto">
        <div className="flex gap-6 items-start">
          {/* Positions column */}
          <div className="flex-1 min-w-0">
            {isLoading && (
              <div className="flex items-center gap-2 text-muted-foreground text-sm pt-8">
                <Loader2 size={16} className="animate-spin" />
                Loading positions and live market data…
              </div>
            )}

            {error && !isLoading && (
              <p className="text-destructive text-sm pt-8">Failed to load portfolio data.</p>
            )}

            {!isLoading && !error && positions.length === 0 && (
              <div className="text-center py-20 text-muted-foreground">
                <p className="text-base">No positions yet.</p>
                <p className="text-sm mt-1">Click "Add Position" to track your first LEAPS contract.</p>
              </div>
            )}

            {!isLoading && sorted.length > 0 && (
              <div className="space-y-3">
                {sorted.map(p => (
                  <PositionCard
                    key={p.id}
                    pos={p}
                    onClose={id => close.mutate(id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Legend column */}
          <div className="w-72 shrink-0 sticky top-4">
            <ScoreLegend />
          </div>
        </div>
      </main>
    </>
  );
}
