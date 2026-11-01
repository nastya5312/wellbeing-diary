import { describe, it, expect } from 'vitest';
import { analyze } from '../src/analysis/analyze';
import { buildTimeline } from '../src/analysis/factors';
import { mantelHaenszelRR } from '../src/analysis/confound';
import { repeats } from '../src/analysis/repeats';
import { confoundTexts, repeatsLine, repeatsTitle, FORBIDDEN_WORDS } from '../src/analysis/texts';
import { Synth, scenarioC, scenarioCorrelated } from './synth';

describe('Мантель–Хензель', () => {
  it('объединённое RR по двум стратам (расчёт вручную: 15 / 7,5 = 2)', () => {
    expect(mantelHaenszelRR([{ a: 10, b: 90, c: 5, d: 95 }, { a: 20, b: 80, c: 10, d: 90 }])).toBeCloseTo(2, 10);
  });
  it('без результата в днях без фактора — бесконечность, пустые страты — не определено', () => {
    expect(mantelHaenszelRR([{ a: 3, b: 2, c: 0, d: 10 }])).toBe(Infinity);
    expect(mantelHaenszelRR([{ a: 0, b: 0, c: 0, d: 0 }])).toBeNull();
  });
});

describe('сценарий C: лекарство только в месячные (7.7)', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    it(`seed ${seed}: о лекарстве — только предупреждение «разделить невозможно», не заметный/сильный вывод`, () => {
      const { s, m } = scenarioC(seed);
      const r = analyze(s.input());
      const mSignals = r.signals.filter((x) => x.factorId === `item:${m}`);
      for (const sig of mSignals) {
        expect(sig.category).toBe('weak');
        const flow = sig.confounds.find((c) => c.gId === 'cycle:flow');
        expect(flow).toBeDefined();
        expect(flow!.inseparable).toBe(true);
        expect(sig.confounded).toBe(true);
        const texts = confoundTexts(sig).join(' ');
        expect(texts).toMatch(/часто совпадает с «день месячных»/);
        expect(texts).toMatch(/Разделить невозможно: «M-лекарство» всегда встречается вместе с «день месячных»/);
      }
      // Связь с месячными данные показывают — но и она помечена совпадением с лекарством
      const flowSig = r.signals.find((x) => x.factorId === 'cycle:flow' && x.lag === 1 && x.outcomeLabel.startsWith('головная-тест'));
      expect(flowSig).toBeDefined();
      expect(flowSig!.confounds.some((c) => c.gId === `item:${m}`)).toBe(true);
    });
  }
});

describe('совпадающие факторы, которые можно разделить', () => {
  it('результат зависит от G: вывод о F после пересчёта по стратам ослабевает (в большинстве наборов)', () => {
    let checked = 0;
    let downgraded = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const { s, f, g } = scenarioCorrelated(seed, 'G');
      const r = analyze(s.input());
      const sig = r.signals.find((x) => x.factorId === `item:${f}` && x.lag === 1 && x.direction === 'more');
      if (!sig) continue;
      checked++;
      const c = sig.confounds.find((x) => x.gId === `item:${g}`);
      expect(c).toBeDefined();
      if (sig.confounded && sig.category === 'weak') downgraded++;
    }
    expect(checked).toBeGreaterThanOrEqual(5);
    expect(downgraded / checked).toBeGreaterThanOrEqual(0.8);
  });

  it('результат зависит от F: вывод о F сохраняется после пересчёта (в большинстве наборов)', () => {
    let kept = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const { s, f, g } = scenarioCorrelated(seed, 'F');
      const r = analyze(s.input());
      const sig = r.signals.find((x) => x.factorId === `item:${f}` && x.lag === 1 && x.direction === 'more');
      if (!sig) continue;
      const c = sig.confounds.find((x) => x.gId === `item:${g}`);
      expect(c).toBeDefined();
      expect(c!.strata).not.toBeNull();
      if (!sig.confounded && sig.category !== 'weak') kept++;
    }
    expect(kept).toBeGreaterThanOrEqual(8);
  });

  it('тег не считается «другим фактором» для своего же продукта', () => {
    const s = new Synth(60, 3);
    const a = s.item('food', 'тест-сыр', ['молочное']);
    const b = s.item('food', 'тест-йогурт', ['молочное']);
    for (let i = 0; i < 60; i++) {
      if (i % 3 === 0) s.event(i, a);
      if (i % 5 === 0) s.event(i, b);
    }
    const t = buildTimeline(s.input());
    const sym = s.item('symptom', 'тест-симптом');
    for (let i = 1; i < 60; i++) if (i % 3 === 1) s.event(i, sym, 3);
    const r = analyze(s.input());
    for (const sig of r.signals.filter((x) => x.factorId === `item:${a}`)) {
      expect(sig.confounds.some((c) => c.gId === 'tag:молочное')).toBe(false);
    }
    expect(t.factors.find((f) => f.id === 'tag:молочное')?.members).toEqual([a, b]);
  });
});

describe('«Повторы» (7.8)', () => {
  it('счёт после каждого случая, незаполненные дни — «?» и не в счёт', () => {
    const s = new Synth(10, 1);
    const x = s.item('supplement', 'тест-добавка');
    const y = s.item('symptom', 'тест-боль');
    s.event(1, x);
    s.event(4, x);
    s.event(7, x);
    s.event(2, y, 3); // после 1-го — на следующий день
    s.event(9, y, 3); // после 3-го — через 2 дня
    s.event(0, y, 3); // в обычный день
    s.days[5]!.completed = false; // день после 2-го случая не заполнен
    const r = repeats(buildTimeline(s.input()), `item:${x}`, `sym:${y}`)!;
    expect(r.occasions).toBe(3);
    expect(r.rows.map((row) => row.values)).toEqual([
      [false, true, false],
      [false, undefined, false],
      [false, false, true],
    ]);
    const next = r.lines.find((l) => l.lag === 1)!;
    expect(next).toEqual({ lag: 1, a: 1, n: 2, c: 1, m: 5 });
    expect(repeatsTitle('тест-добавка', r.occasions)).toBe('После 3 случаев «тест-добавка»');
    expect(repeatsLine('тест-боль', next)).toBe('«тест-боль» на следующий день — в 1 из 2 (50%). В остальные заполненные дни — 1 из 5 (20%).');
  });

  it('тексты предупреждений и повторов без запрещённых слов', () => {
    const { s } = scenarioC(1);
    const r = analyze(s.input());
    const all = r.signals.flatMap((x) => confoundTexts(x));
    all.push(repeatsTitle('X', 1), repeatsLine('Y', { lag: 2, a: 1, n: 1, c: 0, m: 3 }));
    expect(all.length).toBeGreaterThan(2);
    for (const t of all) for (const w of FORBIDDEN_WORDS) expect(t).not.toMatch(w);
  });
});

describe('текст страты без сравнения', () => {
  it('«дней без F нет — сравнивать не с чем» вместо «0 из 0»', () => {
    const { s } = scenarioC(1);
    const r = analyze(s.input());
    const flow = r.signals.find((x) => x.factorId === 'cycle:flow' && x.confounds.some((c) => c.strata));
    expect(flow).toBeDefined();
    if (!flow) return;
    const t = confoundTexts(flow).join(' ');
    expect(t).not.toMatch(/0 из 0/);
  });
});
