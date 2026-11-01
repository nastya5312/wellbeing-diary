// Превращение дневника в ряды по дням: факторы (возможные влияния) и результаты (состояние).
// Значение на день: true / false / undefined. undefined — «неизвестно»: день не заполнен
// или нужных данных нет (например, сон не внесён). Такие дни в расчёт не идут (ТЗ, 7.1).
import type { Course, Day, DiaryEvent, Item, Measurement, Metric, Settings } from '../models/types';
import { addDays, daysBetween } from '../lib/dates';
import { dateRange } from '../lib/trends';
import { cycleStarts } from '../lib/cycle';
import { courseStatus } from '../db/courses';
import { MAX_CYCLE_LOOKAHEAD, PREMENSTRUAL_DAYS } from './thresholds';

export type Value = boolean | undefined;

export type FactorFamily = 'item' | 'tag' | 'sleep' | 'cycle' | 'course';
export type OutcomeFamily = 'symptom' | 'sleep' | 'mood';

export type BinaryVar = {
  id: string;
  label: string;
  family: FactorFamily | OutcomeFamily;
  values: Value[];
  /** Из каких позиций состоит фактор (для позиции, тега, курса) — чтобы не сравнивать тег с его же продуктом */
  members?: string[];
};

export type NumericVar = { id: string; label: string; family: string; values: (number | undefined)[] };

export type AnalysisInput = {
  days: Day[];
  events: DiaryEvent[];
  items: Item[];
  courses: Course[];
  settings: Settings;
  /** Показатели и их значения (вес, пульс…). Необязательны для совместимости. */
  metrics?: Metric[];
  measurements?: Pick<Measurement, 'metricId' | 'date' | 'value'>[];
};

export type Timeline = {
  dates: string[];
  completed: boolean[];
  factors: BinaryVar[];
  outcomes: BinaryVar[];
  numeric: NumericVar[];
};

const FACTOR_KINDS = new Set(['food', 'drink', 'med', 'supplement', 'activity', 'other']);
const hours = (min: number) => `${Math.round((min / 60) * 10) / 10}`.replace('.', ',');

export function buildTimeline(input: AnalysisInput): Timeline {
  const { days, events, items, courses, settings } = input;
  const allDates = [...days.map((d) => d.date), ...events.map((e) => e.date)].sort();
  if (!allDates.length) return { dates: [], completed: [], factors: [], outcomes: [], numeric: [] };
  const dates = dateRange(allDates[0]!, allDates[allDates.length - 1]!);
  const n = dates.length;
  const index = new Map(dates.map((d, i) => [d, i]));
  const dayBy = new Map(days.map((d) => [d.date, d]));
  const completed = dates.map((d) => dayBy.get(d)?.completed === true);
  const itemBy = new Map(items.map((it) => [it.id, it]));

  // События по дням
  const eventsByDay: DiaryEvent[][] = Array.from({ length: n }, () => []);
  for (const e of events) {
    const i = index.get(e.date);
    if (i !== undefined) eventsByDay[i]!.push(e);
  }

  const onCompleted = (fn: (i: number) => boolean): Value[] => dates.map((_, i) => (completed[i] ? fn(i) : undefined));
  const factors: BinaryVar[] = [];
  const outcomes: BinaryVar[] = [];

  // --- Позиции и теги ---
  const usedItems = new Set(events.map((e) => e.itemId));
  const tags = new Map<string, Set<string>>(); // тег → позиции
  for (const it of items) {
    if (!usedItems.has(it.id) || !FACTOR_KINDS.has(it.kind)) continue;
    factors.push({ id: `item:${it.id}`, label: it.name, family: 'item', members: [it.id], values: onCompleted((i) => eventsByDay[i]!.some((e) => e.itemId === it.id)) });
    if (it.kind === 'food' || it.kind === 'drink') {
      for (const t of it.tags) tags.set(t, (tags.get(t) ?? new Set()).add(it.id));
    }
  }
  for (const [tag, ids] of tags) {
    // Тег из одной позиции ничего не добавляет к самой позиции
    if (ids.size < 2) continue;
    factors.push({ id: `tag:${tag}`, label: `тег «${tag}»`, family: 'tag', members: [...ids], values: onCompleted((i) => eventsByDay[i]!.some((e) => ids.has(e.itemId))) });
  }

  // --- Сон (относится к дате пробуждения) ---
  const sleepOf = (i: number) => dayBy.get(dates[i]!)?.sleep;
  const sleepVal = (fn: (s: NonNullable<Day['sleep']>) => boolean | undefined): Value[] =>
    dates.map((_, i) => {
      const s = sleepOf(i);
      return completed[i] && s ? fn(s) : undefined;
    });
  factors.push({ id: 'sleep:short', label: `короткий сон (меньше ${hours(settings.shortSleepMin)} ч)`, family: 'sleep', values: sleepVal((s) => (s.durationMin === undefined ? undefined : s.durationMin < settings.shortSleepMin)) });
  factors.push({ id: 'sleep:long', label: `долгий сон (больше ${hours(settings.longSleepMin)} ч)`, family: 'sleep', values: sleepVal((s) => (s.durationMin === undefined ? undefined : s.durationMin > settings.longSleepMin)) });
  factors.push({ id: 'sleep:poor', label: 'плохое качество сна (1–2)', family: 'sleep', values: sleepVal((s) => (s.quality === undefined ? undefined : s.quality <= 2)) });

  // --- Цикл ---
  factors.push({ id: 'cycle:flow', label: 'день месячных', family: 'cycle', values: onCompleted((i) => (dayBy.get(dates[i]!)?.flow ?? 0) > 0) });
  const starts = cycleStarts(days.filter((d) => (d.flow ?? 0) > 0).map((d) => d.date));
  if (starts.length) {
    const last = dates[n - 1]!;
    factors.push({
      id: 'cycle:pre',
      label: `за 1–${PREMENSTRUAL_DAYS} дней до месячных`,
      family: 'cycle',
      values: dates.map((d, i) => {
        if (!completed[i]) return undefined;
        const next = starts.find((s) => s > d);
        if (next) {
          const gap = daysBetween(d, next);
          return gap > MAX_CYCLE_LOOKAHEAD ? undefined : gap <= PREMENSTRUAL_DAYS;
        }
        // Следующее начало неизвестно: «нет» можно утверждать, только если окно целиком в прошлом
        return addDays(d, PREMENSTRUAL_DAYS) <= last ? false : undefined;
      }),
    });
  }

  // --- Курсы приёма ---
  const coursesBy = new Map<string, Course[]>();
  for (const c of courses) coursesBy.set(c.itemId, [...(coursesBy.get(c.itemId) ?? []), c]);
  for (const [itemId, list] of coursesBy) {
    const it = itemBy.get(itemId);
    if (!it) continue;
    factors.push({ id: `course:${itemId}`, label: `период приёма «${it.name}»`, family: 'course', members: [itemId], values: onCompleted((i) => courseStatus(list, dates[i]!) === 'active') });
  }

  // --- Результаты ---
  const threshold = settings.symptomMinIntensity;
  const symptomIds = new Set(events.filter((e) => e.kind === 'symptom').map((e) => e.itemId));
  for (const id of symptomIds) {
    const it = itemBy.get(id);
    if (!it) continue;
    outcomes.push({
      id: `sym:${id}`,
      label: threshold > 1 ? `${it.name} (сила ≥ ${threshold})` : it.name,
      family: 'symptom',
      values: onCompleted((i) => eventsByDay[i]!.some((e) => e.itemId === id && (e.intensity ?? threshold) >= threshold)),
    });
  }
  outcomes.push({
    id: 'sleep:bad',
    label: 'плохой или короткий сон',
    family: 'sleep',
    values: sleepVal((s) => {
      const poor = s.quality !== undefined ? s.quality <= 2 : undefined;
      const short = s.durationMin !== undefined ? s.durationMin < settings.shortSleepMin : undefined;
      if (poor === undefined && short === undefined) return undefined;
      return poor === true || short === true;
    }),
  });
  const wb = (key: 'mood' | 'energy' | 'stress', test: (v: number) => boolean): Value[] =>
    dates.map((d, i) => {
      const v = dayBy.get(d)?.wellbeing?.[key];
      return completed[i] && v !== undefined ? test(v) : undefined;
    });
  outcomes.push({ id: 'mood:low', label: 'плохое настроение (1–2)', family: 'mood', values: wb('mood', (v) => v <= 2) });
  outcomes.push({ id: 'energy:low', label: 'мало энергии (1–2)', family: 'mood', values: wb('energy', (v) => v <= 2) });
  outcomes.push({ id: 'stress:high', label: 'сильный стресс (4–5)', family: 'mood', values: wb('stress', (v) => v >= 4) });

  // --- Числовые ряды для Спирмена ---
  const num = (fn: (d: Day) => number | undefined) => dates.map((d, i) => (completed[i] ? fn(dayBy.get(d)!) : undefined));
  const numeric: NumericVar[] = [
    { id: 'n:sleepH', label: 'длительность сна', family: 'sleep', values: num((d) => (d.sleep?.durationMin !== undefined ? d.sleep.durationMin / 60 : undefined)) },
    { id: 'n:sleepQ', label: 'качество сна', family: 'sleep', values: num((d) => d.sleep?.quality) },
    { id: 'n:mood', label: 'настроение', family: 'mood', values: num((d) => d.wellbeing?.mood) },
    { id: 'n:energy', label: 'энергия', family: 'mood', values: num((d) => d.wellbeing?.energy) },
    { id: 'n:stress', label: 'стресс', family: 'mood', values: num((d) => d.wellbeing?.stress) },
  ];
  for (const id of symptomIds) {
    const it = itemBy.get(id);
    if (!it) continue;
    numeric.push({
      id: `n:sym:${id}`,
      label: `сила «${it.name}»`,
      family: 'symptom',
      values: dates.map((_, i) => (completed[i] ? Math.max(0, ...eventsByDay[i]!.filter((e) => e.itemId === id).map((e) => e.intensity ?? 1)) : undefined)),
    });
  }

  // Показатели (вес, пульс…): измеренное значение известно и в незаполненный день.
  // Несколько значений за день — среднее.
  for (const m of input.metrics ?? []) {
    if (m.archived) continue;
    const sums = new Map<number, { s: number; k: number }>();
    for (const v of input.measurements ?? []) {
      if (v.metricId !== m.id) continue;
      const i = index.get(v.date);
      if (i === undefined) continue;
      const cur = sums.get(i) ?? { s: 0, k: 0 };
      sums.set(i, { s: cur.s + v.value, k: cur.k + 1 });
    }
    if (!sums.size) continue;
    numeric.push({
      id: `n:metric:${m.id}`,
      label: m.name.toLowerCase(),
      family: 'metric',
      values: dates.map((_, i) => {
        const x = sums.get(i);
        return x ? x.s / x.k : undefined;
      }),
    });
  }

  return { dates, completed, factors, outcomes, numeric };
}
