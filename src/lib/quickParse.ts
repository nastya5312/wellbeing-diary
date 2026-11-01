// Запись одной строкой или голосом: «кофе в 8:30, овсянка, вздутие сильное» → записи.
// Диктовку в текст превращает сам iPhone (микрофон на клавиатуре); здесь — только разбор текста.
// Без словарей и сети: сравнение по основам слов (учёт падежей: «овсянку» ~ «овсянка»).
import type { Item, ItemKind } from '../models/types';
import { normalizeName } from './similar';

export type ParsedPart = {
  /** Исходный кусок фразы */
  text: string;
  item?: Item;
  /** 'HH:MM', если время названо */
  time?: string;
  /** Сила симптома 1–5, если названа */
  intensity?: number;
  /** Название для новой позиции, если в справочнике не нашлось */
  newName?: string;
};

/** Слова, которые ничего не значат для поиска позиции. */
const STOP = new Set([
  'и', 'в', 'во', 'на', 'с', 'со', 'у', 'меня', 'было', 'был', 'была', 'были', 'потом', 'затем', 'ещё', 'еще', 'утром', 'днём', 'днем',
  'вечером', 'ночью', 'около', 'примерно', 'часов', 'часа', 'час', 'ч', 'выпила', 'выпил', 'пила', 'съела', 'съел', 'ела', 'поела', 'приняла',
  'принял', 'пила', 'сделала', 'немного', 'чуть', 'очень', 'сильно', 'сильная', 'сильный', 'сильное', 'слабо', 'слабая', 'слабый', 'слабое',
  'средне', 'средняя', 'средний', 'среднее', 'болит', 'болела', 'болело', 'появилась', 'появился', 'появилось', 'стало', 'стала',
  'таблетку', 'таблетка', 'капсулу', 'чашку', 'чашка', 'стакан', 'кружку', 'порцию', 'тарелку',
]);

/** Грубая основа слова: без окончания (1–2 последние буквы), не короче 3 букв. */
export function stem(word: string): string {
  const w = normalizeName(word).replace(/[^а-яa-z0-9-]/g, '');
  if (w.length <= 4) return w.slice(0, Math.max(3, w.length - 1));
  const cut = /(ами|ями|ого|его|ому|ему|ыми|ими|ой|ей|ую|юю|ая|яя|ое|ее|ые|ие|ий|ый|ов|ев|ам|ям|ах|ях|ом|ем|ью)$/.exec(w);
  const base = cut ? w.slice(0, -cut[0].length) : w.replace(/[аеиоуыэюяйь]$/, '');
  return base.length >= 3 ? base : w.slice(0, 3);
}

const words = (s: string) => normalizeName(s).split(/[^а-яa-z0-9-]+/).filter(Boolean);

/** Насколько позиция подходит к куску фразы: сумма длин совпавших основ (0 — не подходит). */
export function matchScore(fragment: string, itemName: string): number {
  const fw = words(fragment).map(stem);
  const iw = words(itemName).filter((w) => !STOP.has(w));
  if (!iw.length) return 0;
  let score = 0;
  for (const w of iw) {
    const s = stem(w);
    if (!fw.some((f) => f.startsWith(s) || s.startsWith(f) && f.length >= 3)) return 0;
    score += s.length;
  }
  return score;
}

const INTENSITY: [RegExp, number][] = [
  [/очень\s+сильн/, 5],
  [/невыносим/, 5],
  [/сильн/, 4],
  [/средн|умерен/, 3],
  [/слаб|немного|небольш/, 2],
  [/едва|чуть/, 1],
];

function parseTime(s: string): { time?: string; rest: string } {
  let m = /(?:^|\s)(?:в\s*)?([01]?\d|2[0-3])[:.]([0-5]\d)(?=\s|$)/.exec(s);
  if (m) return { time: `${m[1]!.padStart(2, '0')}:${m[2]}`, rest: s.replace(m[0], ' ') };
  m = /(?:^|\s)в\s+([01]?\d|2[0-3])(?:\s*(?:ч|час|часа|часов))?(?=\s|$)/.exec(s);
  if (m) return { time: `${m[1]!.padStart(2, '0')}:00`, rest: s.replace(m[0], ' ') };
  return { rest: s };
}

function parseIntensity(s: string): { intensity?: number; rest: string } {
  const n = normalizeName(s);
  const digit = /(?:^|\s)([1-5])(?:\s*(?:из\s*5|балл\w*))?(?=\s|$)/.exec(n);
  if (digit) return { intensity: Number(digit[1]), rest: n.replace(digit[0], ' ') };
  for (const [re, v] of INTENSITY) if (re.test(n)) return { intensity: v, rest: n };
  return { rest: n };
}

/** Разбор фразы. Позиции ищутся среди items (без архивных); при нескольких подходящих — с наибольшим совпадением. */
export function parseQuick(text: string, items: Item[]): ParsedPart[] {
  const active = items.filter((it) => !it.archived);
  const parts = text
    .replace(/[«»"]/g, ' ')
    .split(/[,;\n]+|\s+(?:и|потом|затем|а ещё|а еще)\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
  const out: ParsedPart[] = [];
  for (const raw of parts) {
    const t = parseTime(raw);
    let best: Item | undefined;
    let bestScore = 0;
    for (const it of active) {
      const sc = matchScore(t.rest, it.name);
      if (sc > bestScore || (sc === bestScore && sc > 0 && best && it.useCount > best.useCount)) {
        best = it;
        bestScore = sc;
      }
    }
    const part: ParsedPart = { text: raw, ...(t.time && { time: t.time }) };
    if (best) {
      part.item = best;
      if (best.kind === 'symptom') {
        const i = parseIntensity(t.rest);
        if (i.intensity) part.intensity = i.intensity;
      }
    } else {
      const name = words(parseIntensity(t.rest).rest)
        .filter((w) => !STOP.has(w))
        .join(' ');
      if (!name) continue;
      part.newName = name;
    }
    out.push(part);
  }
  return out;
}

/** Догадка о типе новой позиции по словам (для кнопки по умолчанию). */
export function guessKind(text: string): ItemKind {
  const n = normalizeName(text);
  if (/бол|тошн|вздут|понос|запор|изжог|сып|зуд|слабост|головокруж|отёк|отек|кашел|насморк/.test(n)) return 'symptom';
  if (/выпил|пила|чай|кофе|сок|вода|молоко|кефир|вино|пиво|какао/.test(n)) return 'drink';
  if (/таблет|капсул|приняла|принял/.test(n)) return 'med';
  return 'food';
}
