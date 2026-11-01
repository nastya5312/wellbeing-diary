import { describe, it, expect } from 'vitest';
import { buildReport } from '../src/lib/report';
import { generateDemo } from '../src/lib/demo';
import { analyze } from '../src/analysis/analyze';
import { DEFAULT_SETTINGS } from '../src/db/defaults';
import type { DiaryEvent, Item } from '../src/models/types';

const item = (id: string, kind: Item['kind'], name: string): Item => ({ id, kind, name, tags: [], favorite: false, archived: false, useCount: 0, createdAt: 0 });
const ev = (id: string, itemId: string, kind: Item['kind'], date: string, hm: string, intensity?: number): DiaryEvent =>
  ({ id, itemId, kind, date, ts: Date.parse(`${date}T${hm}:00+03:00`), ...(intensity && { intensity: intensity as 1 }) });

describe('отчёт врачу', () => {
  it('считает период, симптомы по заполненным дням, приём, интервалы, показатели, стул', () => {
    const items = [item('m', 'med', 'тест-препарат'), item('s', 'symptom', 'тест-боль'), item('f', 'food', 'тест-каша'), item('v', 'supplement', 'тест-добавка')];
    const days = [
      { date: '2026-10-01', completed: true, updatedAt: 0, sleep: { durationMin: 420, quality: 4 as const }, stool: { count: 0 } },
      { date: '2026-10-02', completed: true, updatedAt: 0, sleep: { durationMin: 300 }, stool: { count: 1, type: 1 as const } },
      { date: '2026-10-03', completed: false, updatedAt: 0 },
      { date: '2026-09-20', completed: true, updatedAt: 0 }, // вне периода
    ];
    const events = [
      ev('1', 'm', 'med', '2026-10-01', '07:00'), ev('2', 'f', 'food', '2026-10-01', '07:30'),
      ev('3', 'm', 'med', '2026-10-02', '07:00'), ev('4', 'f', 'food', '2026-10-02', '09:00'),
      ev('5', 's', 'symptom', '2026-10-01', '12:00', 4), ev('6', 's', 'symptom', '2026-10-03', '12:00', 2),
      ev('7', 'v', 'supplement', '2026-10-02', '13:00'),
      ev('8', 's', 'symptom', '2026-09-20', '12:00', 5),
    ];
    const r = buildReport({
      from: '2026-10-01', to: '2026-10-10', days, events, items, courses: [{ id: 'c', itemId: 'm', start: '2026-09-01' }],
      metrics: [{ id: 'w', name: 'Вес', unit: 'кг', archived: false, createdAt: 0 }],
      measurements: [
        { id: 'a', metricId: 'w', date: '2026-10-01', ts: 1, value: 60 },
        { id: 'b', metricId: 'w', date: '2026-10-05', ts: 2, value: 59.5 },
      ],
      shortSleepMin: 360,
    });
    expect(r.periodDays).toBe(10);
    expect(r.completedDays).toBe(2);
    expect(r.sleep).toEqual({ nights: 2, avgMin: 360, avgQuality: 4, shortNights: 1 });
    // день 03.10 не заполнен — его симптом не считается; 20.09 вне периода
    expect(r.symptoms).toEqual([{ name: 'тест-боль', days: 1, of: 2, avgIntensity: 4 }]);
    expect(r.intake.map((x) => [x.name, x.kind, x.days, x.courses])).toEqual([
      ['тест-препарат', 'med', 2, ['2026-09-01 — идёт']],
      ['тест-добавка', 'supplement', 1, []],
    ]);
    expect(r.intervals).toEqual([{ name: 'тест-препарат', days: 2, medianMin: 75, within60: 1 }]);
    expect(r.metrics[0]).toMatchObject({ n: 2, first: { value: 60 }, last: { value: 59.5 }, min: 59.5, max: 60 });
    expect(r.stool).toEqual({ days: 2, noneDays: 1, hardDays: 1, looseDays: 0 });
  });
});

describe('демо-данные', () => {
  const demo = generateDemo('2026-11-01', '04:00');
  it('вымышленные, помечены «Демо:», 120 дней', () => {
    expect(demo.days).toHaveLength(120);
    expect(demo.items.every((it) => it.name.startsWith('Демо:'))).toBe(true);
  });
  it('анализ находит заложенные закономерности и предупреждает о лекарстве А', () => {
    const r = analyze({ ...demo, courses: [], settings: { ...DEFAULT_SETTINGS } });
    const find = (f: string, o: string, lag: number) => r.signals.find((s) => s.factorId === f && s.outcomeId === o && s.lag === lag);
    expect(find('item:d-choco', 'sym:d-rash', 1)?.category).not.toBe('weak');
    expect(find('tag:молочное', 'sym:d-bloat', 0)).toBeDefined();
    // О лекарстве А (только в месячные) — нет заметных выводов; у вывода о месячных есть предупреждение о совпадении с ним
    for (const s of r.signals.filter((x) => x.factorId === 'item:d-medA')) expect(s.category).toBe('weak');
    expect(r.signals.some((s) => s.factorId === 'cycle:flow' && s.confounds.some((c) => c.gId === 'item:d-medA'))).toBe(true);
    // Завтрак раньше чем через час после лекарства Б → изжога
    expect(r.signals.some((s) => s.factorId === 'gap:food:d-medB' && s.outcomeId === 'sym:d-heart' && s.lag === 0)).toBe(true);
  });
});
