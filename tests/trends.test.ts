import { describe, it, expect } from 'vitest';
import type { Day, DiaryEvent } from '../src/models/types';
import {
  dateRange, dayCategories, mean, monthGrid, presence, sleepHoursSeries, symptomSeries, wellbeingSeries,
} from '../src/lib/trends';
import { cycleStarts, cycles, cycleStats } from '../src/lib/cycle';

const day = (date: string, extra: Partial<Day> = {}): Day => ({ date, completed: true, updatedAt: 0, ...extra });
const ev = (date: string, itemId: string, kind: DiaryEvent['kind'], intensity?: number): DiaryEvent =>
  ({ id: `${date}-${itemId}-${Math.random()}`, date, ts: 0, itemId, kind, ...(intensity && { intensity }) }) as DiaryEvent;

describe('ряды для графиков', () => {
  const dates = dateRange('2026-11-01', '2026-11-04');
  const days = new Map<string, Day>([
    ['2026-11-01', day('2026-11-01', { sleep: { durationMin: 465 }, wellbeing: { mood: 4 } })],
    ['2026-11-02', day('2026-11-02')],
    ['2026-11-03', day('2026-11-03', { completed: false, sleep: { durationMin: 360 } })],
  ]);

  it('диапазон дат', () => {
    expect(dates).toEqual(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04']);
    expect(dateRange('2026-12-30', '2027-01-02')).toHaveLength(4);
  });
  it('сон в часах и пропуски', () => {
    expect(sleepHoursSeries(dates, days)).toEqual([7.75, null, 6, null]);
    expect(mean(sleepHoursSeries(dates, days))).toBeCloseTo(6.875);
  });
  it('самочувствие', () => expect(wellbeingSeries(dates, days, 'mood')).toEqual([4, null, null, null]));
  it('симптом: максимум за день, 0 в заполненный день, null в незаполненный', () => {
    const events = [ev('2026-11-01', 'h', 'symptom', 2), ev('2026-11-01', 'h', 'symptom', 4), ev('2026-11-03', 'h', 'symptom'), ev('2026-11-02', 'x', 'symptom', 5)];
    const s = symptomSeries(dates, days, events, 'h');
    expect(s).toEqual([4, 0, 1, null]);
    expect(presence(s)).toEqual({ present: 2, known: 3 });
  });
  it('категории дня', () => {
    expect(dayCategories([ev('d', 'a', 'supplement'), ev('d', 'b', 'drink')])).toEqual({ symptom: false, med: true, food: true });
  });
});

describe('сетка месяца', () => {
  it('ноябрь 2026 начинается с воскресенья', () => {
    const g = monthGrid(2026, 11);
    expect(g[0]).toEqual([null, null, null, null, null, null, '2026-11-01']);
    expect(g.flat().filter(Boolean)).toHaveLength(30);
    expect(g.every((w) => w.length === 7)).toBe(true);
  });
  it('февраль високосного года', () => expect(monthGrid(2028, 2).flat().filter(Boolean)).toHaveLength(29));
});

describe('длины циклов', () => {
  const flow = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-31', '2026-09-01', '2026-09-03', '2026-10-02', '2026-10-03'];
  it('начала циклов (пропуск дня внутри месячных — не новое начало)', () => {
    expect(cycleStarts(flow)).toEqual(['2026-08-03', '2026-08-31', '2026-10-02']);
  });
  it('длины и дни месячных', () => {
    expect(cycles(flow)).toEqual([
      { start: '2026-08-03', periodDays: 3, length: 28 },
      { start: '2026-08-31', periodDays: 3, length: 32 },
      { start: '2026-10-02', periodDays: 2, length: null },
    ]);
  });
  it('сводка', () => {
    expect(cycleStats(cycles(flow))).toEqual({ count: 2, avg: 30, min: 28, max: 32 });
    expect(cycleStats(cycles(['2026-10-02']))).toBeNull();
  });
});
