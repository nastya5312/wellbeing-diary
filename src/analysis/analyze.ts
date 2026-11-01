// Главная функция анализа. Чистая: на входе данные дневника, на выходе найденные сигналы.
import { buildTimeline, type AnalysisInput, type BinaryVar, type Timeline } from './factors';
import { buildTable, rates, riskRatio, type Table2x2 } from './tables';
import { fisherExact } from './fisher';
import { benjaminiHochberg } from './fdr';
import { correlationPValue, spearman } from './spearman';
import { circularShiftPValue, hashString } from './permutation';
import {
  MIN_COINCIDENCES, MIN_COMPLETED_DAYS, MIN_FACTOR_DAYS, MIN_PAIRS, NOTABLE, PERMUTATIONS, PERM_P_MAX, Q_MAX,
  RHO_MIN, RR_HIGH, RR_LOW, STRONG, REPLICATION_RR, REPLICATION_MIN_A,
} from './thresholds';

export type Category = 'weak' | 'notable' | 'strong';

export type Signal = Table2x2 & {
  id: string;
  factorId: string;
  factorLabel: string;
  factorFamily: string;
  outcomeId: string;
  outcomeLabel: string;
  lag: number;
  rateWith: number;
  rateWithout: number;
  diffPp: number; // разница в процентных пунктах
  rr: number | null; // null — не определено; Infinity — без фактора не встречалось
  p: number;
  q: number;
  pPerm: number;
  direction: 'more' | 'less';
  category: Category;
  /** Повторяется ли в обеих половинах периода (без этого — не выше «слабого») */
  replicated: boolean;
  /** Дни D, когда был фактор и результат в D + lag */
  dates: string[];
};

export type Correlation = {
  id: string;
  xId: string;
  xLabel: string;
  yId: string;
  yLabel: string;
  lag: number;
  rho: number;
  pairs: number;
  p: number;
  q: number;
  pPerm: number;
};

export type AnalysisResult = {
  completedDays: number;
  enough: boolean;
  needMore: number;
  testedPairs: number;
  testedNumeric: number;
  /** Прошли пороги, но не прошли проверку перемешиванием (похоже на совпадение серий) */
  rejectedBySeries: number;
  signals: Signal[];
  correlations: Correlation[];
  /** Ряды — нужны для проверки совпадающих факторов (этап 6) */
  timeline: Timeline;
};

/** Пары одного источника в тот же день сравнивать бессмысленно (короткий сон → плохой сон в тот же день). */
function skipPair(f: BinaryVar, o: BinaryVar, lag: number): boolean {
  return lag === 0 && f.family === 'sleep' && o.family === 'sleep';
}

function count(v: (boolean | undefined)[]): { yes: number; no: number } {
  let yes = 0;
  let no = 0;
  for (const x of v) {
    if (x === true) yes++;
    else if (x === false) no++;
  }
  return { yes, no };
}

/** Повторяется ли связь в первой и второй половине периода по отдельности. */
function replicates(f: (boolean | undefined)[], o: (boolean | undefined)[], lag: number, direction: 'more' | 'less', completed: boolean[]): boolean {
  // Делим по середине заполненных дней, чтобы половины были сопоставимы по объёму данных
  const idx = completed.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
  const mid = idx[Math.floor(idx.length / 2)] ?? 0;
  const half = (from: number, to: number) => {
    const mask = (v: (boolean | undefined)[]) => v.map((x, i) => (i >= from && i < to ? x : undefined));
    // Результат может «выйти» за границу половины на lag дней — это допустимо
    return buildTable(mask(f), o.map((x, i) => (i >= from && i < to + lag ? x : undefined)), lag);
  };
  return [half(0, mid), half(mid, f.length)].every((t) => {
    const rr = riskRatio(t);
    if (rr === null || t.a < (direction === 'more' ? REPLICATION_MIN_A : 0)) return false;
    return direction === 'more' ? rr >= REPLICATION_RR : rr <= 1 / REPLICATION_RR;
  });
}

function categorize(q: number, rr: number | null, a: number, direction: 'more' | 'less'): Category {
  // Для «реже» силу считаем по обратному отношению (RR 0.33 так же сильно, как 3)
  const strength = rr === null ? 0 : direction === 'more' ? rr : rr === 0 ? Infinity : 1 / rr;
  if (q <= STRONG.q && strength >= STRONG.rr && a >= STRONG.a) return 'strong';
  if (q <= NOTABLE.q && strength >= NOTABLE.rr) return 'notable';
  return 'weak';
}

export function analyze(input: AnalysisInput): AnalysisResult {
  const timeline = buildTimeline(input);
  const completedDays = timeline.completed.filter(Boolean).length;
  const lags = [...new Set(input.settings.lagDays)].filter((l) => Number.isInteger(l) && l >= 0).sort();
  const base: AnalysisResult = {
    completedDays,
    enough: completedDays >= MIN_COMPLETED_DAYS,
    needMore: Math.max(0, MIN_COMPLETED_DAYS - completedDays),
    testedPairs: 0,
    testedNumeric: 0,
    rejectedBySeries: 0,
    signals: [],
    correlations: [],
    timeline,
  };
  if (!base.enough) return base;

  const n = timeline.dates.length;

  // ---------- Бинарные пары ----------
  // Факторы без контраста (почти всегда есть или почти всегда нет) проверять бессмысленно
  const factors = timeline.factors.filter((f) => {
    const c = count(f.values);
    return c.yes >= MIN_FACTOR_DAYS && c.no >= MIN_FACTOR_DAYS;
  });
  const outcomes = timeline.outcomes.filter((o) => count(o.values).yes >= MIN_COINCIDENCES);

  type Tested = { f: BinaryVar; o: BinaryVar; lag: number; t: Table2x2; p: number };
  const tested: Tested[] = [];
  for (const f of factors) {
    for (const o of outcomes) {
      for (const lag of lags) {
        if (skipPair(f, o, lag)) continue;
        const t = buildTable(f.values, o.values, lag);
        if (t.a + t.b < MIN_FACTOR_DAYS || t.c + t.d < MIN_FACTOR_DAYS) continue;
        tested.push({ f, o, lag, t, p: fisherExact(t.a, t.b, t.c, t.d) });
      }
    }
  }
  const qs = benjaminiHochberg(tested.map((x) => x.p));

  const signals: Signal[] = [];
  let rejectedBySeries = 0;
  tested.forEach((x, k) => {
    const q = qs[k]!;
    const { t } = x;
    const rr = riskRatio(t);
    const r = rates(t);
    if (q > Q_MAX || t.a < MIN_COINCIDENCES || rr === null || r.withF === null || r.withoutF === null) return;
    const direction = rr >= RR_HIGH ? 'more' : rr <= RR_LOW ? 'less' : null;
    if (!direction) return;

    // Проверка перемешиванием: статистика — разница долей в нужную сторону
    const sign = direction === 'more' ? 1 : -1;
    const id = `${x.f.id}|${x.o.id}|${x.lag}`;
    const pPerm = circularShiftPValue(
      n,
      (shift) => {
        const ts = shift === 0 ? t : buildTable(x.f.values, x.o.values, x.lag, shift);
        const rs = rates(ts);
        if (rs.withF === null || rs.withoutF === null) return null;
        return sign * (rs.withF - rs.withoutF);
      },
      PERMUTATIONS,
      hashString(id),
    );
    if (pPerm > PERM_P_MAX) {
      rejectedBySeries++;
      return;
    }

    const dates: string[] = [];
    for (let i = 0; i + x.lag < n; i++) {
      if (x.f.values[i] === true && x.o.values[i + x.lag] === true) dates.push(timeline.dates[i]!);
    }
    const replicated = replicates(x.f.values, x.o.values, x.lag, direction, timeline.completed);
    const raw = categorize(q, rr, t.a, direction);
    signals.push({
      ...t,
      replicated,
      id,
      factorId: x.f.id,
      factorLabel: x.f.label,
      factorFamily: x.f.family,
      outcomeId: x.o.id,
      outcomeLabel: x.o.label,
      lag: x.lag,
      rateWith: r.withF,
      rateWithout: r.withoutF,
      diffPp: Math.round((r.withF - r.withoutF) * 1000) / 10,
      rr,
      p: x.p,
      q,
      pPerm,
      direction,
      category: replicated ? raw : 'weak',
      dates,
    });
  });

  const rank: Record<Category, number> = { strong: 0, notable: 1, weak: 2 };
  signals.sort((s1, s2) => rank[s1.category] - rank[s2.category] || s1.q - s2.q);

  // ---------- Числовые пары (Спирмен, лаги 0 и 1) ----------
  type NumTested = { x: (typeof timeline.numeric)[number]; y: (typeof timeline.numeric)[number]; lag: number; rho: number; pairs: number; p: number };
  const numTested: NumTested[] = [];
  const pairsOf = (xv: (number | undefined)[], yv: (number | undefined)[], lag: number, shift = 0) => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i + lag < n; i++) {
      const j = shift ? (i + lag + shift) % n : i + lag;
      const a = xv[i];
      const b = yv[j];
      if (a !== undefined && b !== undefined) {
        xs.push(a);
        ys.push(b);
      }
    }
    return { xs, ys };
  };
  for (const xv of timeline.numeric) {
    for (const yv of timeline.numeric) {
      for (const lag of [0, 1]) {
        if (xv.id === yv.id) continue;
        // Лаг 0 симметричен: каждую пару считаем один раз
        if (lag === 0 && xv.id > yv.id) continue;
        // Сон и сон в один день — один источник
        if (lag === 0 && xv.family === 'sleep' && yv.family === 'sleep') continue;
        const { xs, ys } = pairsOf(xv.values, yv.values, lag);
        if (xs.length < MIN_PAIRS) continue;
        const rho = spearman(xs, ys);
        if (rho === null) continue;
        numTested.push({ x: xv, y: yv, lag, rho, pairs: xs.length, p: correlationPValue(rho, xs.length) });
      }
    }
  }
  const nq = benjaminiHochberg(numTested.map((t) => t.p));
  const correlations: Correlation[] = [];
  numTested.forEach((t, k) => {
    const q = nq[k]!;
    if (Math.abs(t.rho) < RHO_MIN || q > Q_MAX) return;
    const id = `${t.x.id}|${t.y.id}|${t.lag}`;
    const sign = Math.sign(t.rho);
    const pPerm = circularShiftPValue(
      n,
      (shift) => {
        const { xs, ys } = shift === 0 ? pairsOf(t.x.values, t.y.values, t.lag) : pairsOf(t.x.values, t.y.values, t.lag, shift);
        if (xs.length < MIN_PAIRS) return null;
        const r = spearman(xs, ys);
        return r === null ? null : sign * r;
      },
      PERMUTATIONS,
      hashString(id),
    );
    if (pPerm > PERM_P_MAX) {
      rejectedBySeries++;
      return;
    }
    correlations.push({ id, xId: t.x.id, xLabel: t.x.label, yId: t.y.id, yLabel: t.y.label, lag: t.lag, rho: t.rho, pairs: t.pairs, p: t.p, q, pPerm });
  });
  correlations.sort((a, b) => Math.abs(b.rho) - Math.abs(a.rho));

  return { ...base, testedPairs: tested.length, testedNumeric: numTested.length, rejectedBySeries, signals, correlations };
}
