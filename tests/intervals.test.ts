import { describe, it, expect } from 'vitest';
import type { DiaryEvent, Item } from '../src/models/types';
import { medIntervals } from '../src/lib/intervals';
import { buildTimeline } from '../src/analysis/factors';
import { analyze } from '../src/analysis/analyze';
import { Synth, addNoise, dateAt } from './synth';

const item = (id: string, kind: Item['kind'], name: string, tags: string[] = []): Item =>
  ({ id, kind, name, tags, favorite: false, archived: false, useCount: 0, createdAt: 0 });
const at = (h: number, m = 0) => Date.parse(`2026-11-01T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+03:00`);
const ev = (id: string, itemId: string, kind: Item['kind'], ts: number): DiaryEvent => ({ id, itemId, kind, ts, date: '2026-11-01' });

describe('интервалы после лекарства', () => {
  const items = new Map([
    ['m', item('m', 'med', 'тест-препарат')],
    ['w', item('w', 'drink', 'Вода')],
    ['c', item('c', 'drink', 'тест-кофе')],
    ['f', item('f', 'food', 'тест-каша')],
  ]);
  it('первая еда или напиток после приёма, вода не считается', () => {
    const r = medIntervals([ev('1', 'f', 'food', at(6)), ev('2', 'm', 'med', at(7, 10)), ev('3', 'w', 'drink', at(7, 12)), ev('4', 'c', 'drink', at(8, 5))], items);
    expect(r).toEqual([{ eventId: '2', medName: 'тест-препарат', medTime: '07:10', next: { name: 'тест-кофе', time: '08:05', minutes: 55 } }]);
  });
  it('если после приёма ничего не было — next = null', () => {
    expect(medIntervals([ev('2', 'm', 'med', at(7))], items)[0]!.next).toBeNull();
  });
});

describe('фактор «еда раньше чем через 60 мин» и стул', () => {
  it('интервал определён только в дни с лекарством; стул — результаты', () => {
    const s = new Synth(4, 1);
    const m = s.item('med', 'тест-препарат');
    const f = s.item('food', 'тест-каша');
    // день 0: каша через 30 мин; день 1: через 2 ч; день 2: лекарства нет
    s.events.push({ id: 'a', date: dateAt(0), ts: 1000, itemId: m, kind: 'med' }, { id: 'b', date: dateAt(0), ts: 1000 + 30 * 60000, itemId: f, kind: 'food' });
    s.events.push({ id: 'c', date: dateAt(1), ts: 5000, itemId: m, kind: 'med' }, { id: 'd', date: dateAt(1), ts: 5000 + 120 * 60000, itemId: f, kind: 'food' });
    s.events.push({ id: 'e', date: dateAt(2), ts: 9000, itemId: f, kind: 'food' });
    s.days[0]!.stool = { count: 0 };
    s.days[1]!.stool = { count: 2, type: 1 };
    s.days[2]!.stool = { count: 1 };
    const t = buildTimeline(s.input());
    expect(t.factors.find((x) => x.id === `gap:food:${m}`)!.values).toEqual([true, false, undefined, undefined]);
    expect(t.outcomes.find((x) => x.id === 'stool:none')!.values).toEqual([true, false, false, undefined]);
    expect(t.outcomes.find((x) => x.id === 'stool:hard')!.values).toEqual([false, true, undefined, undefined]);
  });

  it('сравнение короткого и длинного интервала находит заложенную связь (вымышленные данные)', () => {
    const s = new Synth(150, 4);
    addNoise(s, 3, 1);
    const m = s.item('med', 'тест-препарат');
    const f = s.item('food', 'тест-завтрак');
    const y = s.item('symptom', 'тест-симптом');
    for (let i = 0; i < 150; i++) {
      const t0 = i * 86_400_000 + 7 * 3_600_000;
      s.events.push({ id: `m${i}`, date: dateAt(i), ts: t0, itemId: m, kind: 'med' });
      const short = s.random() < 0.4;
      s.events.push({ id: `f${i}`, date: dateAt(i), ts: t0 + (short ? 15 : 90) * 60000, itemId: f, kind: 'food' });
      if (s.random() < (short ? 0.6 : 0.1)) s.event(i, y, 3);
    }
    const r = analyze(s.input());
    const sig = r.signals.find((x) => x.factorId === `gap:food:${m}` && x.lag === 0 && x.direction === 'more');
    expect(sig).toBeDefined();
  });
});
