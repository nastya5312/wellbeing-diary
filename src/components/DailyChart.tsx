import type { Series } from '../lib/trends';
import { formatDateRu } from '../lib/dates';

export type ChartSeries = { label: string; values: Series; variant: 1 | 2 | 3 };

type Props = {
  title: string;
  dates: string[];
  series: ChartSeries[];
  yMin: number;
  yMax: number;
  yTicks: number[];
  kind?: 'line' | 'bar';
  /** Дни месячных — затеняются столбцами */
  flow?: Set<string>;
  yFormat?: (v: number) => string;
};

const W = 340;
const H = 160;
const PAD = { l: 30, r: 8, t: 8, b: 22 };

// График по дням без библиотек. Пропуски (нет данных) разрывают линию.
export function DailyChart({ title, dates, series, yMin, yMax, yTicks, kind = 'line', flow, yFormat = String }: Props) {
  const n = dates.length;
  if (!n) return null;
  const plotW = W - PAD.l - PAD.r;
  const step = plotW / n;
  const x = (i: number) => PAD.l + step * (i + 0.5);
  const y = (v: number) => PAD.t + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b);

  const paths = series.map((s) => {
    let d = '';
    let pen = false;
    s.values.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  });

  // Одиночные точки (окружённые пропусками) рисуются кружками, иначе их не видно
  const isolated = (vals: Series, i: number) => vals[i] !== null && (i === 0 || vals[i - 1] === null) && (i === n - 1 || vals[i + 1] === null);
  const known = series.reduce((a, s) => a + s.values.filter((v) => v !== null).length, 0);

  return (
    <figure class="daily-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${known ? `точек с данными ${known}` : 'нет данных'} за ${n} дн.`}>
        {flow &&
          dates.map((d, i) =>
            flow.has(d) ? <rect key={d} class="chart-flow" x={PAD.l + step * i} width={Math.max(step, 1)} y={PAD.t} height={H - PAD.t - PAD.b} /> : null,
          )}
        {yTicks.map((t) => (
          <g key={t}>
            <line class="chart-grid" x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} />
            <text class="chart-text" x={PAD.l - 4} y={y(t) + 4} text-anchor="end">
              {yFormat(t)}
            </text>
          </g>
        ))}
        {kind === 'bar'
          ? series.map((s) =>
              s.values.map((v, i) =>
                v === null ? null : v === 0 ? (
                  <rect key={i} class="chart-zero" x={x(i) - Math.max(step * 0.35, 0.5)} width={Math.max(step * 0.7, 1)} y={y(yMin) - 2} height={2} />
                ) : (
                  <rect
                    key={i}
                    class={`chart-bar v${s.variant}`}
                    x={x(i) - Math.max(step * 0.35, 0.5)}
                    width={Math.max(step * 0.7, 1)}
                    y={y(v)}
                    height={y(yMin) - y(v)}
                  />
                ),
              ),
            )
          : series.map((s, k) => (
              <g key={s.label}>
                <path class={`chart-series v${s.variant}`} d={paths[k]} />
                {s.values.map((v, i) =>
                  v !== null && (n <= 31 || isolated(s.values, i)) ? (
                    <circle key={i} class={`chart-pt v${s.variant}`} cx={x(i)} cy={y(v)} r={n <= 31 ? 2.5 : 1.8} />
                  ) : null,
                )}
              </g>
            ))}
        <text class="chart-text" x={PAD.l} y={H - 6}>
          {formatDateRu(dates[0]!)}
        </text>
        <text class="chart-text" x={W - PAD.r} y={H - 6} text-anchor="end">
          {formatDateRu(dates[n - 1]!)}
        </text>
      </svg>
      {(series.length > 1 || flow?.size) && (
        <figcaption class="legend small">
          {series.length > 1 &&
            series.map((s) => (
              <span key={s.label} class="legend-item">
                <svg width="22" height="10" aria-hidden="true">
                  <line class={`chart-series v${s.variant}`} x1="1" x2="21" y1="5" y2="5" />
                </svg>
                {s.label}
              </span>
            ))}
          {flow && flow.size > 0 && (
            <span class="legend-item">
              <span class="legend-flow" aria-hidden="true" />
              месячные
            </span>
          )}
        </figcaption>
      )}
    </figure>
  );
}
