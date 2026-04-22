import { useEffect, useRef } from 'react';
import { createChart, ColorType, CrosshairMode, LineStyle } from 'lightweight-charts';

interface OHLCV { t: string; o: number; h: number; l: number; c: number; v: number; }

interface Props {
  ohlc: OHLCV[];
  eventDates: string[];
}

function sma(data: OHLCV[], window: number): Array<{ time: string; value: number }> {
  const out: Array<{ time: string; value: number }> = [];
  for (let i = window - 1; i < data.length; i++) {
    const avg = data.slice(i - window + 1, i + 1).reduce((s, b) => s + b.c, 0) / window;
    out.push({ time: data[i].t, value: +avg.toFixed(4) });
  }
  return out;
}

export default function EventChart({ ohlc, eventDates }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || ohlc.length === 0) return;
    const el = containerRef.current;

    const chart = createChart(el, {
      width: el.clientWidth,
      height: 300,
      layout: {
        background: { type: ColorType.Solid, color: '#0a0e17' },
        textColor: '#6b7280',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#111827' },
        horzLines: { color: '#111827' },
      },
      rightPriceScale: { borderColor: '#1f2937' },
      timeScale: { borderColor: '#1f2937', timeVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
    });

    // Candlesticks
    const candles = chart.addCandlestickSeries({
      upColor:        '#22c55e',
      downColor:      '#ef4444',
      borderUpColor:  '#22c55e',
      borderDownColor:'#ef4444',
      wickUpColor:    '#22c55e',
      wickDownColor:  '#ef4444',
    });
    candles.setData(ohlc.map(b => ({
      time: b.t as any,
      open: b.o, high: b.h, low: b.l, close: b.c,
    })));

    // Event markers
    const eventSet = new Set(eventDates);
    const markers = ohlc
      .filter(b => eventSet.has(b.t))
      .map(b => ({
        time:     b.t as any,
        position: 'belowBar' as const,
        color:    '#ef4444',
        shape:    'arrowUp' as const,
        text:     'Event',
        size:     1,
      }));
    if (markers.length) candles.setMarkers(markers);

    // 9-day SMA (blue — short-term)
    const sma9 = chart.addLineSeries({
      color: '#60a5fa',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      lineStyle: LineStyle.Solid,
    });
    sma9.setData(sma(ohlc, 9) as any);

    // 20-day SMA (amber — medium-term)
    const sma20 = chart.addLineSeries({
      color: '#f59e0b',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      lineStyle: LineStyle.Solid,
    });
    sma20.setData(sma(ohlc, 20) as any);

    // Volume histogram (bottom 20%)
    const vol = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
    });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    vol.setData(ohlc.map(b => ({
      time:  b.t as any,
      value: b.v,
      color: b.c >= b.o ? '#22c55e28' : '#ef444428',
    })));

    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    });
    ro.observe(el);

    return () => { chart.remove(); ro.disconnect(); };
  }, [ohlc, eventDates]);

  return (
    <div>
      <div ref={containerRef} className="w-full" />
      <div className="flex items-center gap-5 mt-1.5 px-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3" style={{ height: 2, background: '#60a5fa' }} /> 9 SMA
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3" style={{ height: 2, background: '#f59e0b' }} /> 20 SMA
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-red-500" /> Event
        </span>
      </div>
    </div>
  );
}
