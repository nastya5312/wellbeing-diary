// Импорт шагов из «Здоровья» через команду iPhone: команда копирует строки «дата шаги» в буфер обмена,
// приложение их разбирает. Разбор терпим к форматам: 2026-10-31, 31.10.2026, «31 окт. 2026 г.», «12 345», «12345.0».
import { isDateString } from './dates';

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'ма', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const pad = (n: number) => String(n).padStart(2, '0');

/** Дата из строки и остаток строки без неё. */
export function extractDate(line: string): { date: string; rest: string } | null {
  let m = /(\d{4})-(\d{2})-(\d{2})/.exec(line);
  if (m) return ok(`${m[1]}-${m[2]}-${m[3]}`, line, m[0]);
  m = /(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})(?!\d)/.exec(line);
  if (m) {
    const y = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
    return ok(`${y}-${pad(+m[2]!)}-${pad(+m[1]!)}`, line, m[0]);
  }
  m = /(\d{1,2})\s+([а-яё]+)\.?\s+(\d{4})(\s*г\.?)?/i.exec(line);
  if (m) {
    const word = m[2]!.toLowerCase();
    const idx = MONTHS.findIndex((p) => (p === 'ма' ? /^ма[йя]/.test(word) : word.startsWith(p)));
    if (idx >= 0) return ok(`${m[3]}-${pad(idx + 1)}-${pad(+m[1]!)}`, line, m[0]);
  }
  return null;
}

function ok(date: string, line: string, matched: string) {
  return isDateString(date) ? { date, rest: line.replace(matched, ' ') } : null;
}

/** Первое число в строке: «12 345», «12 345,0», «12345.7». */
export function extractNumber(s: string): number | null {
  const m = /(\d{1,3}(?:[   ]\d{3})+|\d+)(?:[.,](\d+))?/.exec(s);
  if (!m) return null;
  return Number(m[1]!.replace(/[   ]/g, '') + (m[2] ? `.${m[2]}` : ''));
}

export type StepsParse = {
  /** Шаги по датам (несколько строк за одну дату складываются — так работают и «сырые» записи «Здоровья») */
  days: { date: string; steps: number }[];
  /** Число без даты (если вставили одно число) */
  undated: number | null;
  /** Непонятые строки */
  skipped: string[];
};

export function parseStepsText(text: string): StepsParse {
  const sums = new Map<string, number>();
  const skipped: string[] = [];
  let undated: number | null = null;
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const d = extractDate(line);
    const n = extractNumber(d ? d.rest : line);
    if (n === null || n < 0 || n > 200_000) {
      skipped.push(line);
      continue;
    }
    if (!d) {
      if (lines.length === 1) undated = Math.round(n);
      else skipped.push(line);
      continue;
    }
    sums.set(d.date, (sums.get(d.date) ?? 0) + n);
  }
  const days = [...sums]
    .map(([date, steps]) => ({ date, steps: Math.round(steps) }))
    .filter((x) => x.steps <= 200_000)
    .sort((a, b) => a.date.localeCompare(b.date));
  return { days, undated, skipped };
}
