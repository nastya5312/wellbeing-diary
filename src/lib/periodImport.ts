// Импорт месячных из текста: строки сводки «История циклов» приложения «Трекер периодов» или простые строки «ГГГГ-ММ-ДД N».
// Нужны только дата начала и сколько дней шли месячные — остальное (интенсивность по дням) в таких отчётах картинками.
import { addDays, isDateString } from './dates';

export type ImportedPeriod = { start: string; days: number };
export type PeriodParse = {
  periods: ImportedPeriod[];
  /** Строки, похожие на данные, но не понятые */
  skipped: string[];
  /** Расхождения «длина цикла в отчёте» и «разница между соседними началами» */
  lengthMismatches: number;
  checked: number;
};

const MONTHS: [RegExp, number][] = [
  [/^янв/, 1], [/^фев/, 2], [/^мар/, 3], [/^апр/, 4], [/^ма[йя]/, 5], [/^июн/, 6],
  [/^июл/, 7], [/^авг/, 8], [/^сен/, 9], [/^окт/, 10], [/^ноя/, 11], [/^дек/, 12],
];
const monthOf = (w: string) => MONTHS.find(([re]) => re.test(w.toLowerCase()))?.[1] ?? null;
const pad = (n: number) => String(n).padStart(2, '0');

const DATE = String.raw`(\d{1,2})\s+([а-яё]+)\.?(?:\s*,\s*(\d{4}))?(?:\s*г\.?)?`;
// «9 февр. - 8 марта 5 Дней 28 Дней», «14 дек.,2031 - 12 янв. 6 Дней 30 Дней», «3 окт. - Сегодня 5 Дней»
const ROW = new RegExp(String.raw`^${DATE}\s*-\s*(?:${DATE}|Сегодня)\s+(\d{1,2})\s+(?:Дн[а-яё]*|День)(?:\s+(\d{2,3})\s+(?:Дн[а-яё]*|День))?\s*$`, 'i');
const ISO = /^(\d{4}-\d{2}-\d{2})[\s;,]+(\d{1,2})\s*$/;
const RU = /^(\d{1,2})\.(\d{1,2})\.(\d{4})[\s;,]+(\d{1,2})\s*$/;

export function parsePeriodText(text: string, today: string): PeriodParse {
  const periods = new Map<string, ImportedPeriod>();
  const skipped: string[] = [];
  const stated = new Map<string, number>();
  // Строки отчёта идут от новых к старым: год восстанавливается по предыдущей (более поздней) строке
  let prevStart: string | null = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/\\/g, '');
    if (!line) continue;
    let m = ISO.exec(line);
    if (m && isDateString(m[1]!)) {
      periods.set(m[1]!, { start: m[1]!, days: Number(m[2]) });
      continue;
    }
    m = RU.exec(line);
    if (m) {
      const d = `${m[3]}-${pad(+m[2]!)}-${pad(+m[1]!)}`;
      if (isDateString(d)) {
        periods.set(d, { start: d, days: Number(m[4]) });
        continue;
      }
    }
    m = ROW.exec(line);
    if (m) {
      const mon = monthOf(m[2]!);
      if (!mon) {
        skipped.push(line);
        continue;
      }
      const day = Number(m[1]);
      let year: number;
      if (m[3]) year = Number(m[3]);
      else {
        year = prevStart ? Number(prevStart.slice(0, 4)) : Number(today.slice(0, 4));
        if (prevStart && `${year}-${pad(mon)}-${pad(day)}` >= prevStart) year--;
      }
      const start = `${year}-${pad(mon)}-${pad(day)}`;
      if (!isDateString(start)) {
        skipped.push(line);
        continue;
      }
      periods.set(start, { start, days: Number(m[7]) });
      prevStart = start;
      if (m[8]) stated.set(start, Number(m[8]));
      continue;
    }
    // Остальное — заголовки и пояснения отчёта; пропущенным считаем только строки, похожие на данные
    if (/\d{1,2}\s+[а-яё]+\.?.*(Дн|День)/i.test(line) && !/Страница|шаг|\(/.test(line)) skipped.push(line);
  }

  const list = [...periods.values()].sort((a, b) => a.start.localeCompare(b.start));
  // Сверка: длина цикла из отчёта должна равняться разнице между началами соседних циклов
  let mismatches = 0;
  let checked = 0;
  list.forEach((p, i) => {
    const next = list[i + 1];
    const s = stated.get(p.start);
    if (!next || s === undefined) return;
    checked++;
    if (Math.round((Date.parse(next.start) - Date.parse(p.start)) / 86_400_000) !== s) mismatches++;
  });
  return { periods: list, skipped, lengthMismatches: mismatches, checked };
}

/** Даты месячных периода. */
export function periodDates(p: ImportedPeriod): string[] {
  return Array.from({ length: p.days }, (_, i) => addDays(p.start, i));
}
