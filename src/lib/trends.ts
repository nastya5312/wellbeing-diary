// Ряды для графиков трендов. Чистые функции: на входе дни и события, на выходе значения по датам.
import type { Day, DiaryEvent } from '../models/types';
import { addDays, daysBetween } from './dates';

/** Все даты диапазона [from, to] по порядку. */
export function dateRange(from: string, to: string): string[] {
  const n = daysBetween(from, to);
  return Array.from({ length: Math.max(0, n + 1) }, (_, i) => addDays(from, i));
}

export type Series = (number | null)[]; // null — нет данных (пропуск на графике)

/** Длительность сна в часах по датам. */
export function sleepHoursSeries(dates: string[], days: Map<string, Day>): Series {
  return dates.map((d) => {
    const m = days.get(d)?.sleep?.durationMin;
    return m === undefined ? null : Math.round((m / 60) * 100) / 100;
  });
}

export function sleepQualitySeries(dates: string[], days: Map<string, Day>): Series {
  return dates.map((d) => days.get(d)?.sleep?.quality ?? null);
}

export function wellbeingSeries(dates: string[], days: Map<string, Day>, key: 'mood' | 'energy' | 'stress'): Series {
  return dates.map((d) => days.get(d)?.wellbeing?.[key] ?? null);
}

/**
 * Симптом по дням: максимальная интенсивность за день.
 * Если симптом отмечен без силы — 1. Если не отмечен: 0 в заполненный день, null в незаполненный
 * (в незаполненный день отсутствие записи не значит «не было»).
 */
export function symptomSeries(dates: string[], days: Map<string, Day>, events: DiaryEvent[], itemId: string): Series {
  const byDate = new Map<string, number>();
  for (const e of events) {
    if (e.itemId !== itemId) continue;
    byDate.set(e.date, Math.max(byDate.get(e.date) ?? 0, e.intensity ?? 1));
  }
  return dates.map((d) => byDate.get(d) ?? (days.get(d)?.completed ? 0 : null));
}

export function flowSet(days: Iterable<Day>): Set<string> {
  const s = new Set<string>();
  for (const d of days) if ((d.flow ?? 0) > 0) s.add(d.date);
  return s;
}

/** Среднее по непустым значениям; null, если значений нет. */
export function mean(s: Series): number | null {
  const v = s.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/** Сколько дней симптом был (значение > 0) и среди скольких дней с данными. */
export function presence(s: Series): { present: number; known: number } {
  let present = 0;
  let known = 0;
  for (const x of s) {
    if (x === null) continue;
    known++;
    if (x > 0) present++;
  }
  return { present, known };
}

/** Метки категорий событий дня для календаря. */
export function dayCategories(events: DiaryEvent[]): { symptom: boolean; med: boolean; food: boolean } {
  return {
    symptom: events.some((e) => e.kind === 'symptom'),
    med: events.some((e) => e.kind === 'med' || e.kind === 'supplement'),
    food: events.some((e) => e.kind === 'food' || e.kind === 'drink'),
  };
}

/** Сетка месяца с понедельника: недели по 7 ячеек, null — пустая ячейка. */
export function monthGrid(year: number, month: number): (string | null)[][] {
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const weekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7; // 0 = понедельник
  const cells: (string | null)[] = [...Array(weekday).fill(null), ...dateRange(first, addDays(first, daysInMonth - 1))];
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
