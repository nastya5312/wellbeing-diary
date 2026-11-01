// «Повторы» (ТЗ, 7.8): что было после каждого случая X — без статистики, просто счёт.
import type { Timeline } from './factors';
import { buildTable } from './tables';

export const REPEAT_LAGS = [0, 1, 2] as const;

export type RepeatLine = {
  lag: number;
  /** После X: результат был в a из n случаев (n — случаи, где день D + lag заполнен) */
  a: number;
  n: number;
  /** В остальные заполненные дни: c из m */
  c: number;
  m: number;
};

export type Repeats = {
  /** Заполненные дни с X */
  occasions: number;
  lines: RepeatLine[];
  /** По каждому случаю: результат в D, D+1, D+2 (undefined — день не заполнен или за пределами записей) */
  rows: { date: string; values: (boolean | undefined)[] }[];
};

export function repeats(t: Timeline, factorId: string, outcomeId: string): Repeats | null {
  const f = t.factors.find((x) => x.id === factorId);
  const o = t.outcomes.find((x) => x.id === outcomeId);
  if (!f || !o) return null;
  const lines = REPEAT_LAGS.map((lag) => {
    const tb = buildTable(f.values, o.values, lag);
    return { lag, a: tb.a, n: tb.a + tb.b, c: tb.c, m: tb.c + tb.d };
  });
  const rows: Repeats['rows'] = [];
  f.values.forEach((v, i) => {
    if (v === true) rows.push({ date: t.dates[i]!, values: REPEAT_LAGS.map((lag) => o.values[i + lag]) });
  });
  return { occasions: rows.length, lines, rows };
}

/** Позиции и теги, которые встречались хотя бы раз в заполненные дни. */
export function repeatFactors(t: Timeline) {
  return t.factors.filter((f) => (f.family === 'item' || f.family === 'tag') && f.values.some((v) => v === true));
}

/** Состояния, которые встречались хотя бы раз. */
export function repeatOutcomes(t: Timeline) {
  return t.outcomes.filter((o) => o.values.some((v) => v === true));
}
