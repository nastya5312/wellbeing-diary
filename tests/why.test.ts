import { describe, it, expect } from 'vitest';
import type { Day, DiaryEvent, Item } from '../src/models/types';
import { DEFAULT_SETTINGS } from '../src/db/defaults';
import { rng } from '../src/analysis/permutation';
import { explainSymptom, poissonBinomialUpper, symptomEpisodes } from '../src/analysis/why';
import { whyDetails, whyTitle, hoursAgoText, FORBIDDEN_WORDS } from '../src/analysis/texts';
import { addDays } from '../src/lib/dates';

const START = '2026-05-01';
const at = (date: string, hours: number) => Date.parse(`${date}T00:00:00+03:00`) + Math.round(hours * 3_600_000);

/** Вымышленный дневник по часам. */
class HourSynth {
  days: Day[] = [];
  events: DiaryEvent[] = [];
  items: Item[] = [];
  r: () => number;
  n = 0;
  constructor(public length: number, seed: number) {
    this.r = rng(seed);
    for (let i = 0; i < length; i++) this.days.push({ date: addDays(START, i), completed: true, updatedAt: 0 });
  }
  item(kind: Item['kind'], name: string, tags: string[] = []) {
    const id = `${kind}-${name}`;
    this.items.push({ id, kind, name, tags, favorite: true, archived: false, useCount: 0, createdAt: 0 });
    return id;
  }
  ev(day: number, hours: number, itemId: string, intensity?: number) {
    const date = addDays(START, day);
    const kind = this.items.find((x) => x.id === itemId)!.kind;
    // часы после полуночи следующего дня (до 04:00) относятся к этому же дню дневника
    this.events.push({ id: `e${this.n++}`, date, ts: at(date, hours), itemId, kind, ...(intensity && { intensity: intensity as 1 }) });
  }
  input() {
    return { events: this.events, items: this.items, days: this.days, settings: { ...DEFAULT_SETTINGS }, now: at(addDays(START, this.length + 1), 0) };
  }
}

/** Шумовые продукты в случайное время, независимые от симптома. */
function noise(s: HourSynth, k = 6) {
  for (let j = 0; j < k; j++) {
    const id = s.item('food', `шум-${j}`);
    for (let d = 0; d < s.length; d++) if (s.r() < 0.3) s.ev(d, 8 + s.r() * 13, id);
  }
}

/** X в случайное время дня → симптом через ~lagH часов с вероятностью 0,65; фон симптома 6% в день. */
function scenarioLag(seed: number, lagH: number, length = 150) {
  const s = new HourSynth(length, seed);
  noise(s);
  const x = s.item('food', 'X-продукт');
  const y = s.item('symptom', 'Y-симптом');
  const yHours: number[][] = Array.from({ length: length + 3 }, () => []);
  for (let d = 0; d < length; d++) {
    if (s.r() < 0.3) {
      const h = 9 + s.r() * 10;
      s.ev(d, h, x);
      if (s.r() < 0.65) {
        const t = h + lagH + (s.r() - 0.5) * 2;
        yHours[d + Math.floor(t / 24)]!.push(t % 24 < 4 ? (t % 24) + 24 - 0.01 : t % 24);
      }
    }
    if (s.r() < 0.06) yHours[d]!.push(8 + s.r() * 14);
  }
  for (let d = 0; d < length; d++) for (const h of yHours[d]!) s.ev(d, Math.min(h, 27.9), y, 3);
  return { s, x, y };
}

describe('пуассон-биномиальный хвост', () => {
  it('равные вероятности 0,5: P(X ≥ 3 из 4) = 5/16', () => {
    expect(poissonBinomialUpper([0.5, 0.5, 0.5, 0.5], 3)).toBeCloseTo(5 / 16, 12);
  });
  it('разные вероятности: P(X ≥ 1) = 1 − Π(1 − p)', () => {
    expect(poissonBinomialUpper([0.1, 0.2, 0.3], 1)).toBeCloseTo(1 - 0.9 * 0.8 * 0.7, 12);
    expect(poissonBinomialUpper([0.1], 0)).toBe(1);
  });
});

describe('эпизоды', () => {
  it('отметки ближе 12 ч — один эпизод; слабее порога не считаются', () => {
    const ev = (ts: number, intensity?: number): DiaryEvent => ({ id: String(ts), date: '2026-05-01', ts, itemId: 'y', kind: 'symptom', ...(intensity && { intensity: intensity as 1 }) });
    const H = 3_600_000;
    expect(symptomEpisodes([ev(0), ev(3 * H), ev(13 * H), ev(40 * H, 1)], 'y', 2)).toEqual([0, 13 * H]);
  });
});

describe('«Почему так?»: заложенная связь через ~3 часа', () => {
  it('находится в окне 0–6 ч в 10 наборах из 10, хотя бы заметным сигналом в большинстве', () => {
    let found = 0;
    let notable = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const { s, x, y } = scenarioLag(seed, 3);
      const r = explainSymptom(s.input(), y);
      const c = r.candidates.find((c) => c.exposureId === `item:${x}`);
      if (c && c.windowId === 'h0') found++;
      if (c && c.strength !== 'weak') notable++;
    }
    expect(found).toBe(10);
    expect(notable).toBeGreaterThanOrEqual(8);
  });

  it('связь через ~30 часов находится в окне «за 1–2 суток»', () => {
    let ok = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const { s, x, y } = scenarioLag(seed, 30);
      const c = explainSymptom(s.input(), y).candidates.find((c) => c.exposureId === `item:${x}`);
      if (c?.windowId === 'h24') ok++;
    }
    expect(ok).toBeGreaterThanOrEqual(8);
  });
});

describe('«Почему так?»: случайные данные и распорядок дня', () => {
  it('на независимых данных заметные сигналы редки (≤ 5% наборов), слабых в среднем < 0,5', () => {
    let notableSets = 0;
    let weak = 0;
    const N = 120;
    for (let seed = 1; seed <= N; seed++) {
      const s = new HourSynth(150, 1000 + seed);
      noise(s, 8);
      const y = s.item('symptom', 'Y-симптом');
      for (let d = 0; d < 150; d++) if (s.r() < 0.12) s.ev(d, 8 + s.r() * 14, y, 3);
      const r = explainSymptom(s.input(), y);
      if (r.candidates.some((c) => c.strength !== 'weak')) notableSets++;
      weak += r.candidates.filter((c) => c.strength === 'weak').length;
    }
    expect(notableSets / N).toBeLessThanOrEqual(0.05);
    expect(weak / N).toBeLessThan(0.5);
  });

  it('ежедневный утренний кофе не становится подозреваемым', () => {
    let flagged = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const s = new HourSynth(150, 500 + seed);
      const coffee = s.item('drink', 'кофе');
      const y = s.item('symptom', 'Y-симптом');
      for (let d = 0; d < 150; d++) {
        s.ev(d, 8 + s.r() * 0.5, coffee);
        if (s.r() < 0.15) s.ev(d, 10 + s.r() * 2, y, 3);
      }
      if (explainSymptom(s.input(), y).candidates.some((c) => c.exposureId === `item:${coffee}`)) flagged++;
    }
    expect(flagged).toBeLessThanOrEqual(1);
  });

  it('незаполненные дни не идут в расчёт; мало эпизодов — выводов нет', () => {
    const { s, y } = scenarioLag(3, 3);
    for (const d of s.days) d.completed = false;
    const r = explainSymptom(s.input(), y);
    expect(r.usable).toBe(0);
    expect(r.enough).toBe(false);
    expect(r.candidates).toEqual([]);
  });
});

describe('спутник сильного фактора', () => {
  it('продукт, который едят почти только вместе с X, помечается «чаще всего вместе с X» или «почти всегда вместе»', () => {
    let marked = 0;
    let shown = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const s = new HourSynth(150, 300 + seed);
      noise(s, 3);
      const x = s.item('food', 'X-продукт');
      const z = s.item('food', 'Z-спутник');
      const y = s.item('symptom', 'Y-симптом');
      for (let d = 0; d < 150; d++) {
        if (s.r() < 0.3) {
          const h = 9 + s.r() * 10;
          s.ev(d, h, x);
          if (s.r() < 0.6) s.ev(d, h + 0.2, z);
          if (s.r() < 0.65) s.ev(d, h + 3, y, 3);
        } else if (s.r() < 0.05) s.ev(d, 12, y, 3);
      }
      const c = explainSymptom(s.input(), y).candidates.find((c) => c.exposureId === `item:${z}`);
      if (!c) continue;
      shown++;
      if ((c.mostlyWith === 'X-продукт' || c.together === 'X-продукт') && c.strength === 'weak') marked++;
      else if (c.together || c.mostlyWith) marked++;
    }
    // Спутник либо не показан, либо показан с пометкой
    expect(marked).toBe(shown);
  });
});

describe('разбор выбранного эпизода', () => {
  it('показывает, что было за 48 ч, с пометкой о совпадении по истории', () => {
    const { s, x, y } = scenarioLag(2, 3);
    const r = explainSymptom(s.input(), y);
    const focus = r.focus!;
    expect(focus.present.every((p) => p.hoursBefore > 0 && p.hoursBefore <= 48)).toBe(true);
    const xs = focus.present.find((p) => p.itemId === x);
    if (xs?.candidate) expect(xs.candidate.exposureId).toBe(`item:${x}`);
    // сортировка: сначала совпадающие по истории
    const firstWithout = focus.present.findIndex((p) => !p.candidate);
    if (firstWithout >= 0) expect(focus.present.slice(firstWithout).every((p) => !p.candidate)).toBe(true);
  });
});

describe('тексты «Почему так?»', () => {
  it('без запрещённых слов', () => {
    const texts = [
      whyTitle({ label: 'X', windowLabel: 'за 0–6 ч до' }, 'Y'),
      whyDetails({ observed: 6, cases: 8, expected: 1.6, ratio: 3.75 }),
      whyDetails({ observed: 3, cases: 8, expected: 0, ratio: Infinity }),
      hoursAgoText(0.5), hoursAgoText(5.2), hoursAgoText(30),
    ];
    for (const t of texts) for (const w of FORBIDDEN_WORDS) expect(t).not.toMatch(w);
    expect(whyDetails({ observed: 6, cases: 8, expected: 1.6, ratio: 3.75 })).toBe('Было перед 6 из 8 эпизодов. При обычном распорядке ожидалось бы около 1,6 — это в 3,8 раза чаще.');
    expect(hoursAgoText(30)).toBe('за 1 сут 6 ч до');
  });
});
