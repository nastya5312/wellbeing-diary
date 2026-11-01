// Генератор синтетических (вымышленных) данных для проверки анализа (ТЗ, раздел 13).
import type { Day, DiaryEvent, Item, ItemKind, Settings, Course } from '../src/models/types';
import { DEFAULT_SETTINGS } from '../src/db/defaults';
import { rng } from '../src/analysis/permutation';
import type { AnalysisInput } from '../src/analysis/factors';

const START = '2026-01-01';
export const dateAt = (i: number) => {
  const t = new Date(START + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + i);
  return t.toISOString().slice(0, 10);
};

export class Synth {
  days: Day[] = [];
  events: DiaryEvent[] = [];
  items: Item[] = [];
  courses: Course[] = [];
  settings: Settings = { ...DEFAULT_SETTINGS };
  random: () => number;
  private n = 0;

  constructor(public length: number, seed: number) {
    this.random = rng(seed);
    for (let i = 0; i < length; i++) this.days.push({ date: dateAt(i), completed: true, updatedAt: 0 });
  }

  item(kind: ItemKind, name: string, tags: string[] = []): string {
    const id = `${kind}-${name}`;
    this.items.push({ id, kind, name, tags, favorite: false, archived: false, useCount: 0, createdAt: this.items.length });
    return id;
  }

  event(i: number, itemId: string, intensity?: number) {
    const it = this.items.find((x) => x.id === itemId)!;
    this.events.push({ id: `e${this.n++}`, date: dateAt(i), ts: i * 86_400_000, itemId, kind: it.kind, ...(intensity && { intensity: intensity as 1 }) });
  }

  has(i: number, itemId: string) {
    return this.events.some((e) => e.date === dateAt(i) && e.itemId === itemId);
  }

  /** Случайная позиция с вероятностью prob в каждый день. */
  randomly(itemId: string, prob: number, filter: (i: number) => boolean = () => true) {
    for (let i = 0; i < this.length; i++) if (filter(i) && this.random() < prob) this.event(i, itemId);
  }

  input(): AnalysisInput {
    return { days: this.days, events: this.events, items: this.items, courses: this.courses, settings: this.settings };
  }
}

/** Шумовые позиции и самочувствие, не связанные ни с чем. */
export function addNoise(s: Synth, foods = 6, symptoms = 3) {
  for (let k = 0; k < foods; k++) s.randomly(s.item('food', `шум-еда-${k}`), 0.3);
  for (let k = 0; k < symptoms; k++) s.randomly(s.item('symptom', `шум-симптом-${k}`), 0.2);
  for (const d of s.days) {
    d.wellbeing = { mood: (1 + Math.floor(s.random() * 5)) as 1, energy: (1 + Math.floor(s.random() * 5)) as 1, stress: (1 + Math.floor(s.random() * 5)) as 1 };
    d.sleep = { durationMin: 300 + Math.floor(s.random() * 300), quality: (1 + Math.floor(s.random() * 5)) as 1 };
  }
}

/** Сценарий A: X в день D → симптом Y в D+1 с вероятностью 70% против 10% в остальные дни. */
export function scenarioA(seed: number, length = 120) {
  const s = new Synth(length, seed);
  addNoise(s);
  const x = s.item('food', 'X-продукт');
  const y = s.item('symptom', 'Y-симптом');
  s.randomly(x, 0.3);
  for (let i = 1; i < length; i++) {
    const p = s.has(i - 1, x) ? 0.7 : 0.1;
    if (s.random() < p) s.event(i, y, 3);
  }
  return { s, x, y };
}

/** Сценарий B: всё случайно и независимо. */
export function scenarioB(seed: number, length = 120) {
  const s = new Synth(length, seed);
  addNoise(s, 10, 5);
  return { s };
}

/**
 * Сценарий C (ТЗ, 13): лекарство M только в дни месячных, головная боль на следующий день после месячных часто.
 * С самим M головная боль в данных не связана — анализ обязан это показать предупреждением, а не выводом о M.
 */
export function scenarioC(seed: number, length = 150) {
  const s = new Synth(length, seed);
  addNoise(s);
  const m = s.item('med', 'M-лекарство');
  const y = s.item('symptom', 'головная-тест');
  for (let i = 0; i < length; i++) {
    if (i % 28 < 5) {
      s.days[i]!.flow = 2;
      if (s.random() < 0.8) s.event(i, m);
    }
  }
  for (let i = 1; i < length; i++) {
    const p = (s.days[i - 1]!.flow ?? 0) > 0 ? 0.6 : 0.1;
    if (s.random() < p) s.event(i, y, 3);
  }
  return { s, m, y };
}

/**
 * Фактор F часто вместе с G, но бывает и без него. dependsOn — от чего на деле зависит результат O (на следующий день).
 */
export function scenarioCorrelated(seed: number, dependsOn: 'F' | 'G', length = 180) {
  const s = new Synth(length, seed);
  addNoise(s, 3, 1);
  const g = s.item('food', 'G-продукт');
  const f = s.item('food', 'F-продукт');
  const o = s.item('symptom', 'O-симптом');
  for (let i = 0; i < length; i++) {
    const withG = s.random() < 0.3;
    if (withG) s.event(i, g);
    if (s.random() < (withG ? 0.8 : 0.1)) s.event(i, f);
  }
  const src = dependsOn === 'F' ? f : g;
  for (let i = 1; i < length; i++) {
    if (s.random() < (s.has(i - 1, src) ? 0.7 : 0.08)) s.event(i, o, 3);
  }
  return { s, f, g, o };
}
