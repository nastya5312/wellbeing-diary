import { describe, it, expect } from 'vitest';
import type { Day } from '../src/models/types';
import { bbtOvulation, buildForecast } from '../src/lib/ovulation';
import { addDays } from '../src/lib/dates';

const flowDays = (starts: string[], len = 5) => starts.flatMap((s) => Array.from({ length: len }, (_, i) => addDays(s, i)));
const day = (date: string, extra: Partial<Day> = {}): Day => ({ date, completed: true, updatedAt: 0, ...extra });

// Вымышленные циклы по 28 дней
const S = ['2026-05-01', '2026-05-29', '2026-06-26', '2026-07-24', '2026-08-21'];

describe('прогноз цикла', () => {
  it('медиана длин, диапазон и следующие месячные', () => {
    const f = buildForecast({ flowDates: flowDays(S), days: [], today: '2026-09-05' });
    expect(f.lengths).toEqual([28, 28, 28, 28]);
    expect(f.medianLen).toBe(28);
    expect(f.nextStart).toEqual({ date: '2026-09-18', from: '2026-09-18', to: '2026-09-18' });
  });
  it('нерегулярные циклы дают диапазон; мало данных — ±3 дня', () => {
    const f = buildForecast({ flowDates: flowDays(['2030-01-01', '2030-01-27', '2030-02-26', '2030-03-22']), days: [], today: '2030-04-01' });
    expect(f.lengths).toEqual([26, 30, 24]);
    expect(f.range).toEqual({ min: 24, max: 30 });
    expect(f.nextStart!.date).toBe('2030-04-17');
    expect(f.nextStart!.from).toBe('2030-04-15');
    expect(f.nextStart!.to).toBe('2030-04-21');
    const g = buildForecast({ flowDates: flowDays(['2030-01-01', '2030-01-29']), days: [], today: '2030-02-05' });
    expect(g.nextStart).toEqual({ date: '2030-02-26', from: '2030-02-23', to: '2030-03-01' });
  });
});

describe('овуляция', () => {
  it('календарная оценка: за 14 дней до следующих месячных', () => {
    const f = buildForecast({ flowDates: flowDays(S), days: [], today: '2026-09-05' });
    const first = f.ovulations.find((o) => o.cycleStart === '2026-05-01')!;
    expect(first).toMatchObject({ date: '2026-05-15', method: 'calendar', predicted: false });
    expect(f.lutealFromData).toBe(false);
  });
  it('ручная отметка важнее; своя лютеиновая фаза считается по подтверждённым циклам', () => {
    const days = [day('2026-06-10', { ovulation: true }), day('2026-07-08', { ovulation: true })];
    const f = buildForecast({ flowDates: flowDays(S), days, today: '2026-09-05' });
    expect(f.ovulations.find((o) => o.cycleStart === '2026-05-29')).toMatchObject({ date: '2026-06-10', method: 'marked' });
    // 10.06 → 26.06 = 16 дней, 08.07 → 24.07 = 16 дней
    expect(f.lutealLen).toBe(16);
    expect(f.lutealFromData).toBe(true);
    // календарная оценка других циклов теперь использует 16 дней
    expect(f.ovulations.find((o) => o.cycleStart === '2026-05-01')!.date).toBe('2026-05-13');
  });
  it('тест на ЛГ: овуляция на следующий день после первого положительного', () => {
    const days = [day('2026-06-12', { lh: 'neg' }), day('2026-06-13', { lh: 'pos' }), day('2026-06-14', { lh: 'pos' })];
    const f = buildForecast({ flowDates: flowDays(S), days, today: '2026-09-05' });
    expect(f.ovulations.find((o) => o.cycleStart === '2026-05-29')).toMatchObject({ date: '2026-06-14', method: 'lh' });
  });
  it('температура: подъём на 0,2 °C три дня подряд → овуляция в день перед подъёмом', () => {
    const base = Array.from({ length: 10 }, (_, i) => ({ date: addDays('2026-06-01', i), value: 36.3 + (i % 2) * 0.05 }));
    const up = [36.6, 36.65, 36.7].map((value, i) => ({ date: addDays('2026-06-11', i), value }));
    expect(bbtOvulation([...base, ...up])).toBe('2026-06-10');
    // один скачок — не подъём
    expect(bbtOvulation([...base, { date: '2026-06-11', value: 36.7 }, { date: '2026-06-12', value: 36.3 }, { date: '2026-06-13', value: 36.3 }])).toBeNull();
  });
  it('овуляция ещё не наступившего цикла предсказывается после предсказанных месячных', () => {
    const f = buildForecast({ flowDates: flowDays(S), days: [], today: '2026-09-05' });
    const future = f.ovulations.filter((o) => o.predicted);
    expect(future.map((o) => o.date)).toContain('2026-09-04'); // текущий цикл: 18.09 − 14
    expect(future.map((o) => o.date)).toContain('2026-10-02'); // следующий: 16.10 − 14
  });
});
