import { useState } from 'react';
import { inr, inrShort } from '../lib/money';

/** Money in (solid) vs costs (hatched) per month. One axis, hover tooltip, legend. */
export function MoneyChart({ data }: { data: { key: string; label: string; income: number; costs: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = 230, padL = 44, padB = 26, padT = 10;
  const max = Math.max(1, ...data.flatMap((d) => [d.income, d.costs]));
  const step = niceStep(max / 3);
  const top = Math.ceil(max / step) * step;
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / top);
  const colW = (W - padL) / data.length;
  const bw = Math.min(22, colW / 3.2);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const h = hover !== null ? data[hover] : null;

  return (
    <div className="chart" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Monthly money in versus costs">
        <defs>
          <pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="1.6" height="5" fill="var(--hatch)" />
          </pattern>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid-line" x1={padL} x2={W} y1={y(t)} y2={y(t)} />
            <text className="axis" x={padL - 10} y={y(t) + 3} textAnchor="end">{t ? inrShort(t).replace('₹', '') : '0'}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = padL + colW * i + colW / 2;
          const base = y(0);
          return (
            <g key={d.key}>
              <rect className={`hit${hover === i ? ' on' : ''}`} x={cx - colW / 2 + 3} y={padT} width={colW - 6} height={H - padT - padB} rx={10}
                onMouseEnter={() => setHover(i)} onClick={() => setHover(hover === i ? null : i)} />
              <path className="bar-in" d={roundTop(cx - bw - 1, y(d.income), bw, base - y(d.income))} pointerEvents="none" />
              <path className="bar-out" d={roundTop(cx + 1, y(d.costs), bw, base - y(d.costs))} pointerEvents="none" />
              <text className="axis" x={cx} y={H - 6} textAnchor="middle">{d.label}</text>
            </g>
          );
        })}
      </svg>
      {h && hover !== null && (
        <div className="chart-tip" style={{ left: `${((padL + colW * hover + colW / 2) / W) * 100}%`, top: `${(y(Math.max(h.income, h.costs)) / H) * 100}%` }}>
          <div className="eyebrow" style={{ color: 'inherit', opacity: 0.6 }}>{h.key}</div>
          <div className="r"><span>In</span><b>{inr(h.income)}</b></div>
          <div className="r"><span>Costs</span><b>{inr(h.costs)}</b></div>
          <div className="r"><span>Net</span><b>{inr(h.income - h.costs)}</b></div>
        </div>
      )}
    </div>
  );
}

function roundTop(x: number, y: number, w: number, h: number) {
  if (h <= 0) return '';
  const r = Math.min(4, h, w / 2);
  return `M${x} ${y + h}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h}Z`;
}
function niceStep(raw: number) {
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
