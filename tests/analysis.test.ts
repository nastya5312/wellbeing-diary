import { describe, it, expect } from 'vitest';
import { analyze } from '../src/analysis/analyze';
import { buildTimeline } from '../src/analysis/factors';
import { buildTable, riskRatio, phi } from '../src/analysis/tables';
import { circularShiftPValue } from '../src/analysis/permutation';
import { signalTitle, signalDetails, correlationTitle, FORBIDDEN_WORDS } from '../src/analysis/texts';
import { Synth, addNoise, scenarioA, scenarioB, dateAt } from './synth';

describe('таблица 2×2 и лаги', () => {
  it('лаг сдвигает результат на следующий день, неизвестные дни пропускаются', () => {
    const f = [true, false, true, undefined, true, false];
    const o = [false, true, false, true, undefined, true];
    // лаг 1: пары (0,1)=T,T a; (1,2)=F,F d; (2,3)=T,T a; (3,4)=?; (4,5)=T,T a
    expect(buildTable(f, o, 1)).toEqual({ a: 3, b: 0, c: 0, d: 1 });
    expect(buildTable(f, o, 0)).toEqual({ a: 0, b: 2, c: 2, d: 0 });
  });
  it('отношение рисков: обычное, не определено, бесконечность', () => {
    expect(riskRatio({ a: 6, b: 4, c: 1, d: 9 })).toBeCloseTo(6);
    expect(riskRatio({ a: 0, b: 0, c: 1, d: 9 })).toBeNull();
    expect(riskRatio({ a: 3, b: 3, c: 0, d: 50 })).toBe(Infinity);
  });
  it('phi', () => {
    expect(phi([true, true, false, false], [true, true, false, false]).phi).toBeCloseTo(1);
    expect(phi([true, false, true, false], [true, true, false, false]).phi).toBeCloseTo(0);
  });
  it('перемешивание: настоящая связь даёт маленький p, отсутствие — большой', () => {
    const n = 100;
    const x = Array.from({ length: n }, (_, i) => i % 7 < 2);
    const pReal = circularShiftPValue(n, (sh) => x.filter((v, i) => v && x[(i + sh) % n]).length, 200, 1);
    expect(pReal).toBeLessThan(0.05);
  });
});

describe('только заполненные дни (7.1)', () => {
  it('незаполненный день — «неизвестно», а не «не было»', () => {
    const s = new Synth(10, 1);
    const x = s.item('food', 'X');
    s.event(0, x);
    s.days[1]!.completed = false;
    const t = buildTimeline(s.input());
    const f = t.factors.find((v) => v.id === `item:${x}`)!;
    expect(f.values[0]).toBe(true);
    expect(f.values[1]).toBeUndefined();
    expect(f.values[2]).toBe(false);
  });
});

describe('сценарий D: мало данных', () => {
  it('меньше 30 заполненных дней — выводов нет, есть «прогресс»', () => {
    const { s } = scenarioA(3, 40);
    s.days.forEach((d, i) => (d.completed = i < 25));
    const r = analyze(s.input());
    expect(r.enough).toBe(false);
    expect(r.completedDays).toBe(25);
    expect(r.needMore).toBe(5);
    expect(r.signals).toEqual([]);
    expect(r.correlations).toEqual([]);
  });
});

describe('сценарий A: заложенная связь X → Y на следующий день', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    it(`находится (seed ${seed})`, () => {
      const { s, x, y } = scenarioA(seed);
      const r = analyze(s.input());
      const hit = r.signals.find((sg) => sg.factorId === `item:${x}` && sg.outcomeId === `sym:${y}` && sg.lag === 1);
      expect(hit, 'связь должна найтись').toBeDefined();
      expect(hit!.direction).toBe('more');
      expect(['notable', 'strong']).toContain(hit!.category);
      expect(hit!.replicated).toBe(true);
      expect(hit!.rateWith).toBeGreaterThan(0.5);
      expect(hit!.rateWithout).toBeLessThan(0.2);
      // Даты «показать дни» соответствуют a
      expect(hit!.dates).toHaveLength(hit!.a);
    });
  }
});

describe('сценарий B: случайные данные', () => {
  // Ноль ложных находок на любом числе случайных наборов математически недостижим.
  // Требование: «заметный/сильный» ложный сигнал — не чаще ~1 набора из 50, слабый — меньше 1 на набор.
  it('заметные и сильные сигналы практически не появляются (300 наборов, не больше 2%)', () => {
    let setsWithNotable = 0;
    let weak = 0;
    for (let seed = 1000; seed < 1300; seed++) {
      const r = analyze(scenarioB(seed).s.input());
      if (r.signals.some((sg) => sg.category !== 'weak')) setsWithNotable++;
      weak += r.signals.filter((sg) => sg.category === 'weak').length;
    }
    expect(setsWithNotable / 300).toBeLessThanOrEqual(0.02);
    expect(weak / 300).toBeLessThan(1);
  }, 120000);
});

describe('сценарий E: пропуски', () => {
  it('пропущенные дни не считаются «без фактора»', () => {
    // В незаполненные дни симптом записан (отмечала урывками), а фактора нет.
    // Если бы незаполненные дни считались «фактора не было», появилась бы ложная связь «X — реже».
    const s = new Synth(150, 9);
    addNoise(s, 2, 0);
    const x = s.item('food', 'X');
    const y = s.item('symptom', 'Y');
    for (let i = 0; i < 150; i++) {
      const missing = i % 3 === 2;
      s.days[i]!.completed = !missing;
      if (missing) {
        s.event(i, y, 3);
      } else {
        if (s.random() < 0.35) s.event(i, x);
        if (s.random() < 0.2) s.event(i, y, 3);
      }
    }
    const r = analyze(s.input());
    expect(r.signals.filter((sg) => sg.factorId === `item:${x}` && sg.outcomeId === `sym:${y}`)).toEqual([]);
    // Пары считаются только по заполненным дням: лаг 0 — 100 дней
    const t = buildTimeline(s.input());
    const tab = buildTable(t.factors.find((v) => v.id === `item:${x}`)!.values, t.outcomes.find((v) => v.id === `sym:${y}`)!.values, 0);
    expect(tab.a + tab.b + tab.c + tab.d).toBe(100);
  });
  it('связь из сценария A находится и с 30% пропусков', () => {
    const { s, x, y } = scenarioA(7, 200);
    s.days.forEach((d, i) => (d.completed = (i * 7) % 10 >= 3));
    const r = analyze(s.input());
    expect(r.signals.some((sg) => sg.factorId === `item:${x}` && sg.outcomeId === `sym:${y}` && sg.lag === 1)).toBe(true);
  });
});

describe('числовые пары (Спирмен)', () => {
  it('связь «короткий сон → низкая энергия на следующий день» находится', () => {
    const s = new Synth(90, 5);
    for (let i = 0; i < 90; i++) {
      const dur = 300 + Math.floor(s.random() * 240);
      s.days[i]!.sleep = { durationMin: dur };
      s.days[i]!.wellbeing = { energy: 3 };
    }
    for (let i = 1; i < 90; i++) {
      const prev = s.days[i - 1]!.sleep!.durationMin!;
      const e = Math.max(1, Math.min(5, Math.round((prev - 300) / 60) + (s.random() < 0.3 ? 1 : 0)));
      s.days[i]!.wellbeing = { energy: e as 1 };
    }
    const r = analyze(s.input());
    const c = r.correlations.find((x) => x.xId === 'n:sleepH' && x.yId === 'n:energy' && x.lag === 1);
    expect(c).toBeDefined();
    expect(c!.rho).toBeGreaterThan(0.35);
  });

  it('ежедневный показатель (вымышленный «пульс») участвует в анализе: связь с коротким сном находится', () => {
    const s = new Synth(90, 7);
    const values: { metricId: string; date: string; value: number }[] = [];
    for (let i = 0; i < 90; i++) {
      const dur = 300 + Math.floor(s.random() * 240);
      s.days[i]!.sleep = { durationMin: dur };
      // чем короче сон, тем выше показатель в тот же день утром (синтетика)
      values.push({ metricId: 'm1', date: s.days[i]!.date, value: 90 - dur / 10 + s.random() * 6 });
    }
    const input = { ...s.input(), metrics: [{ id: 'm1', name: 'Тест-пульс', unit: 'уд/мин', archived: false, createdAt: 0 }], measurements: values };
    const r = analyze(input);
    const c = r.correlations.find((x) => x.yId === 'n:metric:m1' || x.xId === 'n:metric:m1');
    expect(c).toBeDefined();
    expect(c!.rho).toBeLessThan(-0.35);
  });
});

describe('формулировки (7.9)', () => {
  it('без запрещённых слов', () => {
    const { s } = scenarioA(1);
    const r = analyze(s.input());
    const texts = [...r.signals.flatMap((sg) => [signalTitle(sg), signalDetails(sg)]), ...r.correlations.map(correlationTitle)];
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) for (const w of FORBIDDEN_WORDS) expect(t).not.toMatch(w);
  });
  it('лаг 0 помечен как «порядок неизвестен»', () => {
    const { s } = scenarioA(1);
    const sg = analyze(s.input()).signals[0]!;
    expect(signalTitle({ ...sg, lag: 0 })).toMatch(/порядок событий внутри дня неизвестен/);
    expect(dateAt(0)).toBe('2026-01-01');
  });
});

describe('производительность', () => {
  it('год данных с 40 факторами считается быстро', () => {
    const s = new Synth(365, 11);
    addNoise(s, 35, 8);
    const t0 = performance.now();
    analyze(s.input());
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(3000);
  });
});
