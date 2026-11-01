import { daysBetween, formatDateRu } from '../lib/dates';

type Point = { date: string; value: number };

type Props = {
  points: Point[];
  refLow?: number;
  refHigh?: number;
  unit?: string;
  label: string;
};

const W = 340;
const H = 170;
const PAD = { l: 44, r: 12, t: 12, b: 28 };

const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : Number(v.toFixed(2)).toString()).replace('.', ',');

// Лёгкий SVG-график без библиотек. Полоса — норма, введённая пользовательницей.
export function LineChart({ points, refLow, refHigh, unit, label }: Props) {
  if (points.length === 0) return null;
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0]!.date;
  const last = sorted[sorted.length - 1]!.date;
  const span = Math.max(1, daysBetween(first, last));

  const vals = sorted.map((p) => p.value);
  let lo = Math.min(...vals, ...(refLow !== undefined ? [refLow] : []));
  let hi = Math.max(...vals, ...(refHigh !== undefined ? [refHigh] : []));
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * 0.1;
  lo -= pad;
  hi += pad;

  const x = (d: string) => (sorted.length === 1 ? (PAD.l + W - PAD.r) / 2 : PAD.l + (daysBetween(first, d) / span) * (W - PAD.l - PAD.r));
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);

  const path = sorted.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const summary = `${label}: значений ${sorted.length}, с ${formatDateRu(first)} по ${formatDateRu(last)}, последнее ${fmt(sorted[sorted.length - 1]!.value)} ${unit ?? ''}`;

  return (
    <svg class="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary}>
      {(refLow !== undefined || refHigh !== undefined) && (
        <rect
          class="chart-ref"
          x={PAD.l}
          width={W - PAD.l - PAD.r}
          y={y(refHigh ?? hi)}
          height={Math.max(0, y(refLow ?? lo) - y(refHigh ?? hi))}
        />
      )}
      <line class="chart-axis" x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} />
      <text class="chart-text" x={PAD.l - 6} y={y(hi - pad) + 4} text-anchor="end">
        {fmt(hi - pad)}
      </text>
      <text class="chart-text" x={PAD.l - 6} y={y(lo + pad) + 4} text-anchor="end">
        {fmt(lo + pad)}
      </text>
      <text class="chart-text" x={PAD.l} y={H - 8} text-anchor="start">
        {formatDateRu(first)}
      </text>
      {first !== last && (
        <text class="chart-text" x={W - PAD.r} y={H - 8} text-anchor="end">
          {formatDateRu(last)}
        </text>
      )}
      <path class="chart-line" d={path} />
      {sorted.map((p, i) => (
        <circle key={i} class="chart-dot" cx={x(p.date)} cy={y(p.value)} r={3.5} />
      ))}
    </svg>
  );
}
