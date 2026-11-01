// «Мои эксперименты»: сравнение периода, заданного пользовательницей, с таким же по длине периодом перед ним.
// Только заполненные дни. Доли — точный критерий Фишера, средние — перестановочный тест; поправка Бенджамини–Хохберга.
// Сравнение «до/во время» не учитывает другие перемены за это время (сезон, цикл, стресс) — это пишется в интерфейсе.
import type { Day, DiaryEvent, Experiment, Item, Measurement, Metric, Settings } from '../models/types';
import { addDays, daysBetween } from '../lib/dates';
import { fisherExact } from './fisher';
import { benjaminiHochberg } from './fdr';
import { hashString, rng } from './permutation';

export const EXP = { minDays: 7, permutations: 2000, qShow: 0.05 } as const;

export type ExperimentInput = { days: Day[]; events: DiaryEvent[]; items: Item[]; metrics: Metric[]; measurements: Measurement[]; settings: Settings };

export type ExpRow = {
  id: string;
  label: string;
  kind: 'rate' | 'mean';
  before: { value: number; n: number; count?: number };
  during: { value: number; n: number; count?: number };
  /** Изменение во время эксперимента: больше / меньше */
  direction: 'up' | 'down' | 'same';
  p: number;
  q: number;
  /** Разница устойчива (q ≤ 0,05) */
  clear: boolean;
};

export type ExpResult = {
  status: 'planned' | 'running' | 'finished';
  /** Сколько дней прошло / всего */
  dayNo: number;
  totalDays: number;
  before: { from: string; to: string; completed: number };
  during: { from: string; to: string; completed: number };
  enough: boolean;
  rows: ExpRow[];
};

function permutationP(a: number[], b: number[], seed: number): number {
  const all = [...a, ...b];
  const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length;
  const obs = Math.abs(mean(b) - mean(a));
  const r = rng(seed);
  let hits = 0;
  for (let k = 0; k < EXP.permutations; k++) {
    // Фишер–Йейтс
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [all[i], all[j]] = [all[j]!, all[i]!];
    }
    const d = Math.abs(mean(all.slice(a.length)) - mean(all.slice(0, a.length)));
    if (d >= obs - 1e-12) hits++;
  }
  return (hits + 1) / (EXP.permutations + 1);
}

export function compareExperiment(input: ExperimentInput, exp: Experiment, today: string): ExpResult {
  const totalDays = daysBetween(exp.start, exp.end) + 1;
  const status = today < exp.start ? 'planned' : today > exp.end ? 'finished' : 'running';
  const duringTo = today < exp.end ? today : exp.end;
  const len = status === 'planned' ? 0 : daysBetween(exp.start, duringTo) + 1;
  const beforeFrom = addDays(exp.start, -Math.max(len, 1));
  const beforeTo = addDays(exp.start, -1);
  const completed = new Set(input.days.filter((d) => d.completed).map((d) => d.date));
  const inRange = (d: string, a: string, b: string) => d >= a && d <= b && completed.has(d);
  const dayList = (a: string, b: string) => {
    const out: string[] = [];
    for (let d = a; d <= b; d = addDays(d, 1)) if (completed.has(d)) out.push(d);
    return out;
  };
  const bDays = status === 'planned' ? [] : dayList(beforeFrom, beforeTo);
  const dDays = status === 'planned' ? [] : dayList(exp.start, duringTo);
  const res: ExpResult = {
    status,
    dayNo: Math.min(len, totalDays),
    totalDays,
    before: { from: beforeFrom, to: beforeTo, completed: bDays.length },
    during: { from: exp.start, to: duringTo, completed: dDays.length },
    enough: bDays.length >= EXP.minDays && dDays.length >= EXP.minDays,
    rows: [],
  };
  if (!res.enough) return res;

  const dayBy = new Map(input.days.map((d) => [d.date, d]));
  const itemBy = new Map(input.items.map((it) => [it.id, it]));
  const raw: Omit<ExpRow, 'q' | 'clear'>[] = [];

  // Симптомы: доля дней с симптомом (сила ≥ порога)
  const symDays = new Map<string, Set<string>>();
  for (const e of input.events) {
    if (e.kind !== 'symptom' || (e.intensity ?? input.settings.symptomMinIntensity) < input.settings.symptomMinIntensity) continue;
    if (!inRange(e.date, beforeFrom, duringTo)) continue;
    symDays.set(e.itemId, (symDays.get(e.itemId) ?? new Set()).add(e.date));
  }
  const rate = (id: string, label: string, has: (d: string) => boolean | undefined) => {
    const cnt = (list: string[]) => {
      let yes = 0;
      let n = 0;
      for (const d of list) {
        const v = has(d);
        if (v === undefined) continue;
        n++;
        if (v) yes++;
      }
      return { yes, n };
    };
    const a = cnt(bDays);
    const b = cnt(dDays);
    if (a.n < EXP.minDays || b.n < EXP.minDays || a.yes + b.yes === 0) return;
    const ra = a.yes / a.n;
    const rb = b.yes / b.n;
    raw.push({
      id,
      label,
      kind: 'rate',
      before: { value: ra, n: a.n, count: a.yes },
      during: { value: rb, n: b.n, count: b.yes },
      direction: rb > ra ? 'up' : rb < ra ? 'down' : 'same',
      p: fisherExact(b.yes, b.n - b.yes, a.yes, a.n - a.yes),
    });
  };
  for (const [id, set] of symDays) rate(`sym:${id}`, itemBy.get(id)?.name ?? 'симптом', (d) => set.has(d));
  rate('stool:hard', 'твёрдый стул (тип 1–2)', (d) => {
    const s = dayBy.get(d)?.stool;
    return s ? s.count > 0 && (s.type ?? 4) <= 2 : undefined;
  });
  rate('stool:loose', 'жидкий стул (тип 6–7)', (d) => {
    const s = dayBy.get(d)?.stool;
    return s ? s.count > 0 && (s.type ?? 4) >= 6 : undefined;
  });

  // Средние: сон, самочувствие, ежедневные показатели
  const mean = (id: string, label: string, val: (d: string) => number | undefined) => {
    const a = bDays.map(val).filter((v): v is number => v !== undefined);
    const b = dDays.map(val).filter((v): v is number => v !== undefined);
    if (a.length < EXP.minDays || b.length < EXP.minDays) return;
    const m = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length;
    const ma = m(a);
    const mb = m(b);
    raw.push({
      id,
      label,
      kind: 'mean',
      before: { value: ma, n: a.length },
      during: { value: mb, n: b.length },
      direction: Math.abs(mb - ma) < 1e-9 ? 'same' : mb > ma ? 'up' : 'down',
      p: permutationP(a, b, hashString(exp.id + id)),
    });
  };
  mean('sleepH', 'сон, ч', (d) => {
    const v = dayBy.get(d)?.sleep?.durationMin;
    return v === undefined ? undefined : v / 60;
  });
  mean('sleepQ', 'качество сна (1–5)', (d) => dayBy.get(d)?.sleep?.quality);
  mean('mood', 'настроение (1–5)', (d) => dayBy.get(d)?.wellbeing?.mood);
  mean('energy', 'энергия (1–5)', (d) => dayBy.get(d)?.wellbeing?.energy);
  mean('stress', 'стресс (1–5)', (d) => dayBy.get(d)?.wellbeing?.stress);
  for (const m of input.metrics.filter((x) => !x.archived)) {
    const byDate = new Map<string, number[]>();
    for (const v of input.measurements) if (v.metricId === m.id) byDate.set(v.date, [...(byDate.get(v.date) ?? []), v.value]);
    if (!byDate.size) continue;
    mean(`metric:${m.id}`, `${m.name}${m.unit ? `, ${m.unit}` : ''}`, (d) => {
      const xs = byDate.get(d);
      return xs ? xs.reduce((s, v) => s + v, 0) / xs.length : undefined;
    });
  }

  const qs = benjaminiHochberg(raw.map((r) => r.p));
  res.rows = raw
    .map((r, i) => ({ ...r, q: qs[i]!, clear: qs[i]! <= EXP.qShow && r.direction !== 'same' }))
    .sort((a, b) => Number(b.clear) - Number(a.clear) || a.q - b.q);
  return res;
}
