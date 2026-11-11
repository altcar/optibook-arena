import { useId, useMemo, useState } from 'react';
import type { InstrumentState } from '../../shared/types';
import { fmtPct, fmtPrice } from '../format';

const W = 860;
const H = 300;
const PAD = { left: 14, right: 68, top: 26, bottom: 30 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

function pathFor(values: number[], min: number, range: number): string {
  return values
    .map((value, index) => {
      const x = PAD.left + (index / Math.max(1, values.length - 1)) * PLOT_W;
      const y = PAD.top + (1 - (value - min) / range) * PLOT_H;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

export function PriceChart({ stock, dual }: { stock: InstrumentState; dual: InstrumentState }) {
  const [hover, setHover] = useState<number | null>(null);
  const gradientId = useId().replace(/:/g, '');
  const windowSize = 190;

  const chart = useMemo(() => {
    const stockRaw = stock.history.slice(-windowSize);
    const dualRaw = dual.history.slice(-windowSize);
    const length = Math.max(stockRaw.length, dualRaw.length);
    if (length < 2) return null;
    const trim = (values: number[]) => values.slice(-length);
    const s = trim(stockRaw);
    const d = trim(dualRaw);
    const sBase = s[0] || 1;
    const dBase = d[0] || 1;
    const stockPct = s.map((v) => (v / sBase - 1) * 100);
    const dualPct = d.map((v) => (v / dBase - 1) * 100);
    const all = [...stockPct, ...dualPct];
    const rawMin = Math.min(...all);
    const rawMax = Math.max(...all);
    const padding = Math.max(0.015, (rawMax - rawMin) * 0.18);
    const min = rawMin - padding;
    const max = rawMax + padding;
    const range = max - min || 1;
    const stockNow = stockPct[stockPct.length - 1] ?? 0;
    const dualNow = dualPct[dualPct.length - 1] ?? 0;
    return { s, d, stockPct, dualPct, min, range, stockNow, dualNow, length };
  }, [stock.history, dual.history]);

  if (!chart) {
    return (
      <section className="panel chart-panel">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Price action</h2>
            <p className="panel-sub">Waiting for market history…</p>
          </div>
        </div>
        <div className="chart-empty">Collecting ticks</div>
      </section>
    );
  }

  const yFor = (pct: number) => PAD.top + (1 - (pct - chart.min) / chart.range) * PLOT_H;
  const xFor = (index: number) => PAD.left + (index / Math.max(1, chart.length - 1)) * PLOT_W;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => chart.min + f * chart.range);
  const stockPath = pathFor(chart.stockPct, chart.min, chart.range);
  const dualPath = pathFor(chart.dualPct, chart.min, chart.range);
  const areaPath = `${stockPath} L${PAD.left + PLOT_W},${PAD.top + PLOT_H} L${PAD.left},${PAD.top + PLOT_H} Z`;

  const hoverIndex = hover === null ? null : Math.max(0, Math.min(chart.length - 1, hover));
  const hoverX = hoverIndex === null ? 0 : xFor(hoverIndex);
  const hoverPrice = hoverIndex === null ? 0 : chart.s[hoverIndex];
  const hoverDual = hoverIndex === null ? 0 : chart.d[hoverIndex];
  const hoverPct = hoverIndex === null ? 0 : chart.stockPct[hoverIndex];
  const tooltipX = hoverX > W - 210 ? hoverX - 188 : hoverX + 12;

  return (
    <section className="panel chart-panel">
      <div className="panel-head chart-head">
        <div>
          <h2 className="panel-title">Price action</h2>
          <p className="panel-sub">Last {chart.length} ticks · normalised % change</p>
        </div>
        <div className="chart-legend">
          <span className="legend-item">
            <span className="legend-line stock" />
            {stock.symbol}
            <span className={chart.stockNow >= 0 ? 'pos' : 'neg'}>{fmtPct(chart.stockNow, { signed: true })}</span>
          </span>
          <span className="legend-item">
            <span className="legend-line dual" />
            {stock.symbol}_DUAL
            <span className={chart.dualNow >= 0 ? 'pos' : 'neg'}>{fmtPct(chart.dualNow, { signed: true })}</span>
          </span>
        </div>
      </div>

      <div className="chart-wrap">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="chart-svg"
          role="img"
          aria-label={`${stock.symbol} and ${dual.symbol} price chart`}
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
            setHover(Math.round(ratio * (chart.length - 1)));
          }}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={`area-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#38bdf8" stopOpacity="0.23" />
              <stop offset="1" stopColor="#38bdf8" stopOpacity="0" />
            </linearGradient>
          </defs>

          {ticks.map((tick, index) => {
            const y = yFor(tick);
            return (
              <g key={index}>
                <line x1={PAD.left} y1={y} x2={PAD.left + PLOT_W} y2={y} className="chart-grid-line" />
                <text x={W - PAD.right + 12} y={y + 4} className="chart-axis-label">
                  {tick >= 0 ? '+' : ''}
                  {tick.toFixed(2)}%
                </text>
              </g>
            );
          })}

          <line x1={PAD.left} y1={yFor(0)} x2={PAD.left + PLOT_W} y2={yFor(0)} className="chart-zero-line" />

          <path d={areaPath} fill={`url(#area-${gradientId})`} />
          <path d={stockPath} className="chart-line stock" />
          <path d={dualPath} className="chart-line dual" />

          <circle cx={xFor(chart.length - 1)} cy={yFor(chart.stockNow)} r="3.4" className="chart-dot stock" />
          <circle cx={xFor(chart.length - 1)} cy={yFor(chart.dualNow)} r="2.8" className="chart-dot dual" />

          <text x={PAD.left} y={H - 8} className="chart-axis-label">
            −{chart.length - 1} ticks
          </text>
          <text x={PAD.left + PLOT_W} y={H - 8} className="chart-axis-label" textAnchor="end">
            now
          </text>

          {hoverIndex !== null && (
            <g>
              <line x1={hoverX} y1={PAD.top} x2={hoverX} y2={PAD.top + PLOT_H} className="chart-crosshair" />
              <circle cx={hoverX} cy={yFor(chart.stockPct[hoverIndex])} r="4" className="chart-dot stock" />
              <circle cx={hoverX} cy={yFor(chart.dualPct[hoverIndex])} r="3.4" className="chart-dot dual" />
              <g transform={`translate(${tooltipX}, ${PAD.top + 8})`}>
                <rect width="176" height="76" rx="8" className="chart-tooltip-bg" />
                <text x="12" y="20" className="tooltip-label">
                  {stock.symbol} · {fmtPrice(hoverPrice)}
                </text>
                <text x="12" y="38" className={hoverPct >= 0 ? 'tooltip-pos' : 'tooltip-neg'}>
                  {fmtPct(hoverPct, { signed: true })}
                </text>
                <text x="12" y="58" className="tooltip-label">
                  DUAL · {fmtPrice(hoverDual)}
                </text>
                <text x="96" y="58" className={chart.dualPct[hoverIndex] >= 0 ? 'tooltip-pos' : 'tooltip-neg'}>
                  {fmtPct(chart.dualPct[hoverIndex], { signed: true })}
                </text>
              </g>
            </g>
          )}
        </svg>
      </div>
    </section>
  );
}
