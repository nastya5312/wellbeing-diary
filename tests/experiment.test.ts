import { describe, it, expect } from 'vitest';
import type { Day, DiaryEvent, Experiment, Item } from '../src/models/types';
import { DEFAULT_SETTINGS } from '../src/db/defaults';
import { rng } from '../src/analysis/permutation';
import { compareExperiment } from '../src/analysis/experiment';
import { addDays } from '../src/lib/dates';

const START = '2026-08-01';
const exp: Experiment = { id: 'x1', name: 'тест-эксперимент', start: '2026-09-01', end: '2026-09-21', createdAt: 0 };
const items: Item[] = [{ id: 's', kind: 'symptom', name: 'тест-вздутие', tags: [], favorite: true, archived: false, useCount: 0, createdAt: 0 }];

function data(seed: number, pBefore: number, pDuring: number, moodShift = 0) {
  const r = rng(seed);
  const days: Day[] = [];
  const events: DiaryEvent[] = [];
  for (let i = 0; i < 60; i++) {
    const date = addDays(START, i);
    const during = date >= exp.start && date <= exp.end;
    days.push({ date, completed: true, updatedAt: 0, wellbeing: { mood: Math.max(1, Math.min(5, Math.round(2.5 + r() * 2 + (during ? moodShift : 0)))) as 1 } });
    if (r() < (during ? pDuring : pBefore)) events.push({ id: `e${i}`, date, ts: i, itemId: 's', kind: 'symptom', intensity: 3 });
  }
  return { days, events, items, metrics: [], measurements: [], settings: { ...DEFAULT_SETTINGS } };
}

describe('«Мои эксперименты»', () => {
  it('заметное снижение симптома во время эксперимента видно как устойчивая разница', () => {
    let clear = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const r = compareExperiment(data(seed, 0.6, 0.1), exp, '2026-09-30');
      expect(r.status).toBe('finished');
      expect(r.during.completed).toBe(21);
      expect(r.before).toMatchObject({ from: '2026-08-11', to: '2026-08-31', completed: 21 });
      const row = r.rows.find((x) => x.id === 'sym:s')!;
      if (row.clear && row.direction === 'down') clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(9);
  });

  it('без изменений устойчивые разницы редки', () => {
    let falseClear = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const r = compareExperiment(data(100 + seed, 0.3, 0.3), exp, '2026-09-30');
      if (r.rows.some((x) => x.clear)) falseClear++;
    }
    expect(falseClear / 60).toBeLessThanOrEqual(0.1);
  });

  it('идущий эксперимент сравнивается с периодом той же длины; до начала — «запланирован»', () => {
    const d = data(5, 0.3, 0.3);
    const r = compareExperiment(d, exp, '2026-09-10');
    expect(r).toMatchObject({ status: 'running', dayNo: 10, totalDays: 21 });
    expect(r.before).toMatchObject({ from: '2026-08-22', to: '2026-08-31' });
    expect(compareExperiment(d, exp, '2026-08-20')).toMatchObject({ status: 'planned', enough: false, rows: [] });
  });

  it('мало заполненных дней — без выводов', () => {
    const d = data(7, 0.6, 0.1);
    for (const day of d.days) if (day.date >= '2026-09-05') day.completed = false;
    const r = compareExperiment(d, exp, '2026-09-30');
    expect(r.enough).toBe(false);
    expect(r.rows).toEqual([]);
  });

  it('среднее настроение: сдвиг вверх виден', () => {
    const r = compareExperiment(data(9, 0.3, 0.3, 1.5), exp, '2026-09-30');
    const mood = r.rows.find((x) => x.id === 'mood')!;
    expect(mood.direction).toBe('up');
    expect(mood.clear).toBe(true);
  });
});
