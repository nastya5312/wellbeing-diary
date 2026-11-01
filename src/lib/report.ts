// Данные для отчёта врачу за период (ТЗ, 6.9). Чистая функция — проверяется тестами.
import type { Course, Day, DiaryEvent, Item, Measurement, Metric } from '../models/types';
import { daysBetween } from './dates';
import { cycles } from './cycle';
import { firstAfter } from './intervals';

export type ReportInput = {
  from: string;
  to: string;
  days: Day[];
  events: DiaryEvent[];
  items: Item[];
  courses: Course[];
  metrics: Metric[];
  measurements: Measurement[];
  /** Порог короткого сна из настроек, мин */
  shortSleepMin: number;
};

export type ReportData = {
  from: string;
  to: string;
  periodDays: number;
  completedDays: number;
  sleep: { nights: number; avgMin: number | null; avgQuality: number | null; shortNights: number };
  wellbeing: { days: number; mood: number | null; energy: number | null; stress: number | null };
  symptoms: { name: string; days: number; of: number; avgIntensity: number | null }[];
  intake: { name: string; kind: 'med' | 'supplement'; days: number; first: string; last: string; courses: string[] }[];
  intervals: { name: string; days: number; medianMin: number | null; within60: number }[];
  metrics: { name: string; unit: string; n: number; first: { date: string; value: number }; last: { date: string; value: number }; min: number; max: number; refLow?: number; refHigh?: number }[];
  stool: { days: number; noneDays: number; hardDays: number; looseDays: number };
  cycle: { starts: string[]; lengths: number[]; periodDays: number };
};

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export function buildReport(input: ReportInput): ReportData {
  const { from, to } = input;
  const inP = (d: string) => d >= from && d <= to;
  const days = input.days.filter((d) => inP(d.date));
  const events = input.events.filter((e) => inP(e.date));
  const itemBy = new Map(input.items.map((it) => [it.id, it]));
  const completed = new Set(days.filter((d) => d.completed).map((d) => d.date));

  // Сон и самочувствие — по всем дням с записью (это измерения, а не отсутствие события)
  const sleeps = days.map((d) => d.sleep).filter((s) => s !== undefined);
  const durs = sleeps.map((s) => s.durationMin).filter((x): x is number => x !== undefined);
  const quals = sleeps.map((s) => s.quality).filter((x): x is NonNullable<typeof x> => x !== undefined);
  const wb = days.map((d) => d.wellbeing).filter((w) => w !== undefined);
  const wbAvg = (k: 'mood' | 'energy' | 'stress') => avg(wb.map((w) => w[k]).filter((x): x is NonNullable<typeof x> => x !== undefined));

  // Симптомы — доля среди заполненных дней (в незаполненный день отсутствие отметки ничего не значит)
  const symDays = new Map<string, { dates: Set<string>; intensities: number[] }>();
  for (const e of events) {
    if (e.kind !== 'symptom' || !completed.has(e.date)) continue;
    const cur = symDays.get(e.itemId) ?? { dates: new Set(), intensities: [] };
    cur.dates.add(e.date);
    if (e.intensity) cur.intensities.push(e.intensity);
    symDays.set(e.itemId, cur);
  }
  const symptoms = [...symDays]
    .map(([id, v]) => ({ name: itemBy.get(id)?.name ?? '—', days: v.dates.size, of: completed.size, avgIntensity: avg(v.intensities) }))
    .sort((a, b) => b.days - a.days || a.name.localeCompare(b.name, 'ru'));

  // Лекарства и добавки — дни приёма в периоде, курсы, пересекающие период
  const intakeDays = new Map<string, Set<string>>();
  for (const e of events) {
    if (e.kind !== 'med' && e.kind !== 'supplement') continue;
    intakeDays.set(e.itemId, (intakeDays.get(e.itemId) ?? new Set()).add(e.date));
  }
  const fmtCourse = (c: Course) => `${c.start}${c.end ? `–${c.end}` : ' — идёт'}`;
  const intake = [...intakeDays]
    .map(([id, set]) => {
      const it = itemBy.get(id);
      const ds = [...set].sort();
      return {
        name: it?.name ?? '—',
        kind: (it?.kind === 'supplement' ? 'supplement' : 'med') as 'med' | 'supplement',
        days: set.size,
        first: ds[0]!,
        last: ds[ds.length - 1]!,
        courses: input.courses.filter((c) => c.itemId === id && c.start <= to && (c.end === undefined || c.end >= from)).map(fmtCourse),
      };
    })
    .sort((a, b) => (a.kind === b.kind ? b.days - a.days : a.kind === 'med' ? -1 : 1));

  // Интервал «лекарство → первая еда/напиток (кроме воды)» по дням
  const byDay = new Map<string, DiaryEvent[]>();
  for (const e of events) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  const gaps = new Map<string, number[]>();
  for (const dayEv of byDay.values()) {
    const firstMed = new Map<string, DiaryEvent>();
    for (const e of dayEv) if (e.kind === 'med' && (!firstMed.has(e.itemId) || e.ts < firstMed.get(e.itemId)!.ts)) firstMed.set(e.itemId, e);
    for (const [id, m] of firstMed) {
      const f = firstAfter(m.ts, dayEv, itemBy, 'food');
      if (f) gaps.set(id, [...(gaps.get(id) ?? []), Math.round((f.ts - m.ts) / 60000)]);
    }
  }
  const intervals = [...gaps].map(([id, xs]) => ({
    name: itemBy.get(id)?.name ?? '—',
    days: xs.length,
    medianMin: median(xs),
    within60: xs.filter((x) => x < 60).length,
  }));

  // Показатели
  const metrics = input.metrics
    .map((m) => {
      const vs = input.measurements.filter((v) => v.metricId === m.id && inP(v.date)).sort((a, b) => a.date.localeCompare(b.date) || a.ts - b.ts);
      if (!vs.length) return null;
      const values = vs.map((v) => v.value);
      return {
        name: m.name,
        unit: m.unit,
        n: vs.length,
        first: { date: vs[0]!.date, value: vs[0]!.value },
        last: { date: vs[vs.length - 1]!.date, value: vs[vs.length - 1]!.value },
        min: Math.min(...values),
        max: Math.max(...values),
        ...(m.refLow !== undefined && { refLow: m.refLow }),
        ...(m.refHigh !== undefined && { refHigh: m.refHigh }),
      };
    })
    .filter((x) => x !== null);

  // Стул
  const stools = days.map((d) => d.stool).filter((s) => s !== undefined);
  const stool = {
    days: stools.length,
    noneDays: stools.filter((s) => s.count === 0).length,
    hardDays: stools.filter((s) => s.count > 0 && s.type !== undefined && s.type <= 2).length,
    looseDays: stools.filter((s) => s.count > 0 && s.type !== undefined && s.type >= 6).length,
  };

  // Цикл: начала в периоде и длины завершённых циклов, начавшихся в периоде
  const allFlow = input.days.filter((d) => (d.flow ?? 0) > 0).map((d) => d.date);
  const cyc = cycles(allFlow).filter((c) => inP(c.start));
  const cycle = {
    starts: cyc.map((c) => c.start),
    lengths: cyc.map((c) => c.length).filter((x): x is number => x !== null),
    periodDays: days.filter((d) => (d.flow ?? 0) > 0).length,
  };

  return {
    from,
    to,
    periodDays: daysBetween(from, to) + 1,
    completedDays: completed.size,
    sleep: { nights: sleeps.length, avgMin: avg(durs), avgQuality: avg(quals), shortNights: durs.filter((x) => x < input.shortSleepMin).length },
    wellbeing: { days: wb.length, mood: wbAvg('mood'), energy: wbAvg('energy'), stress: wbAvg('stress') },
    symptoms,
    intake,
    intervals,
    metrics,
    stool,
    cycle,
  };
}
