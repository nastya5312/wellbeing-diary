// Овуляции и прогноз цикла. Всё — оценки по записям самой пользовательницы, не медицинский вывод и не метод контрацепции.
// Источники овуляции для каждого цикла, по надёжности:
//  1) отмечена вручную; 2) тест на ЛГ: овуляция ≈ на следующий день после первого положительного;
//  3) сдвиг базальной температуры (3 дня подряд выше максимума предыдущих 6 на ≥ 0,2 °C; овуляция — день перед подъёмом);
//  4) календарная оценка: за длину лютеиновой фазы до следующих месячных (своя медиана, если есть подтверждённые, иначе 14 дней).
import type { Day } from '../models/types';
import { addDays, daysBetween } from './dates';
import { cycleStarts } from './cycle';

export type OvMethod = 'marked' | 'lh' | 'bbt' | 'calendar';

export type Ovulation = { date: string; method: OvMethod; cycleStart: string; predicted: boolean };

export type Forecast = {
  starts: string[];
  /** Длины завершённых циклов (15–60 дней), от старых к новым */
  lengths: number[];
  medianLen: number | null;
  /** Последние до 6 длин: разброс для диапазона прогноза */
  range: { min: number; max: number } | null;
  lutealLen: number;
  lutealFromData: boolean;
  nextStart: { date: string; from: string; to: string } | null;
  ovulations: Ovulation[];
};

export const METHOD_LABEL: Record<OvMethod, string> = {
  marked: 'отмечена вручную',
  lh: 'по тесту на ЛГ',
  bbt: 'по температуре',
  calendar: 'оценка по календарю',
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** Сдвиг базальной температуры → дата овуляции (день перед подъёмом) или null. */
export function bbtOvulation(points: { date: string; value: number }[]): string | null {
  const t = [...points].sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 6; i + 2 < t.length; i++) {
    const base = Math.max(...t.slice(i - 6, i).map((p) => p.value));
    const up = [t[i]!, t[i + 1]!, t[i + 2]!];
    if (up.every((p) => p.value >= base + 0.2 - 1e-9) && daysBetween(up[0]!.date, up[2]!.date) <= 4) return addDays(up[0]!.date, -1);
  }
  return null;
}

export function buildForecast(input: { flowDates: string[]; days: Day[]; bbt?: { date: string; value: number }[]; today: string }): Forecast {
  const starts = cycleStarts(input.flowDates);
  const lengths: { start: string; len: number }[] = [];
  starts.forEach((s, i) => {
    const next = starts[i + 1];
    if (!next) return;
    const len = daysBetween(s, next);
    if (len >= 15 && len <= 60) lengths.push({ start: s, len });
  });
  const lens = lengths.map((l) => l.len);
  const recent = lens.slice(-6);
  const medianLen = lens.length ? Math.round(median(recent)) : null;
  const range = recent.length >= 3 ? { min: Math.min(...recent), max: Math.max(...recent) } : null;

  const dayBy = new Map(input.days.map((d) => [d.date, d]));
  const bbt = input.bbt ?? [];
  const last = starts[starts.length - 1];

  // Предсказанное начало следующих месячных
  let nextStart: Forecast['nextStart'] = null;
  if (last && medianLen) {
    const date = addDays(last, medianLen);
    const lo = range ? range.min : medianLen - 3;
    const hi = range ? range.max : medianLen + 3;
    nextStart = { date, from: addDays(last, lo), to: addDays(last, hi) };
  }

  // Овуляции по циклам: сначала по данным, потом календарная оценка
  const found: Ovulation[] = [];
  const confirmedGaps: number[] = [];
  starts.forEach((start, i) => {
    const next = starts[i + 1];
    const end = next ? addDays(next, -1) : addDays(input.today, 0);
    const inCycle = (d: string) => d >= addDays(start, 4) && d <= end;
    let hit: Ovulation | null = null;
    const marked = input.days.filter((d) => d.ovulation && inCycle(d.date)).map((d) => d.date).sort();
    if (marked.length) hit = { date: marked[0]!, method: 'marked', cycleStart: start, predicted: false };
    if (!hit) {
      const pos = input.days.filter((d) => d.lh === 'pos' && inCycle(d.date)).map((d) => d.date).sort();
      if (pos.length) hit = { date: addDays(pos[0]!, 1), method: 'lh', cycleStart: start, predicted: false };
    }
    if (!hit) {
      const d = bbtOvulation(bbt.filter((p) => p.date >= start && p.date <= end));
      if (d) hit = { date: d, method: 'bbt', cycleStart: start, predicted: false };
    }
    if (hit) {
      found.push(hit);
      if (next) confirmedGaps.push(daysBetween(hit.date, next));
    }
  });
  const lutealFromData = confirmedGaps.length >= 1;
  const lutealLen = lutealFromData ? Math.min(16, Math.max(10, Math.round(median(confirmedGaps)))) : 14;

  const ovulations: Ovulation[] = [...found];
  starts.forEach((start, i) => {
    if (found.some((o) => o.cycleStart === start)) return;
    const next = starts[i + 1];
    if (next) ovulations.push({ date: addDays(next, -lutealLen), method: 'calendar', cycleStart: start, predicted: false });
    else if (nextStart) ovulations.push({ date: addDays(nextStart.date, -lutealLen), method: 'calendar', cycleStart: start, predicted: true });
  });
  // Овуляция в ещё не наступившем цикле (после предсказанных месячных)
  if (nextStart) {
    const ns = nextStart.date;
    if (ns > input.today && medianLen) ovulations.push({ date: addDays(ns, medianLen - lutealLen), method: 'calendar', cycleStart: ns, predicted: true });
  }
  ovulations.sort((a, b) => a.date.localeCompare(b.date));
  void dayBy;
  return { starts, lengths: lens, medianLen, range, lutealLen, lutealFromData, nextStart, ovulations };
}
