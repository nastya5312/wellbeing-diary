import { addDays, daysBetween } from './dates';

// Разрыв без месячных (в днях), после которого начинается новый цикл.
// Один-два пропущенных дня внутри месячных не считаются новым началом.
const START_GAP_DAYS = 3;
// Дальше этого цикл не показываем: скорее всего, данные о месячных просто не вносились.
const MAX_CYCLE_DAYS = 60;

/**
 * День цикла для даты today: 1 = первый день последних месячных.
 * flowDates — даты с месячными (flow > 0). Возвращает null, если данных нет или они слишком старые.
 */
export function cycleDay(flowDates: string[], today: string): number | null {
  const set = new Set(flowDates);
  const sorted = [...set].filter((d) => d <= today).sort();
  for (let i = sorted.length - 1; i >= 0; i--) {
    const d = sorted[i]!;
    let isStart = true;
    for (let k = 1; k <= START_GAP_DAYS; k++) {
      if (set.has(addDays(d, -k))) {
        isStart = false;
        break;
      }
    }
    if (isStart) {
      const day = daysBetween(d, today) + 1;
      return day <= MAX_CYCLE_DAYS ? day : null;
    }
  }
  return null;
}

export type CycleInfo = {
  start: string; // первый день месячных
  periodDays: number; // сколько дней отмечены месячные в этом цикле
  length: number | null; // дней до следующего начала; null — цикл ещё идёт
};

/** Начала циклов: день с месячными, перед которым START_GAP_DAYS дней без месячных. */
export function cycleStarts(flowDates: string[]): string[] {
  const set = new Set(flowDates);
  return [...set].sort().filter((d) => {
    for (let k = 1; k <= START_GAP_DAYS; k++) if (set.has(addDays(d, -k))) return false;
    return true;
  });
}

/** Циклы по порядку: дата начала, длина (до следующего начала) и число дней месячных. */
export function cycles(flowDates: string[]): CycleInfo[] {
  const set = new Set(flowDates);
  const starts = cycleStarts(flowDates);
  return starts.map((start, i) => {
    const next = starts[i + 1];
    let periodDays = 0;
    for (const d of set) if (d >= start && (!next || d < next)) periodDays++;
    return { start, periodDays, length: next ? daysBetween(start, next) : null };
  });
}

/** Сводка по завершённым циклам: средняя, минимальная и максимальная длина. */
export function cycleStats(list: CycleInfo[]): { count: number; avg: number; min: number; max: number } | null {
  const lens = list.map((c) => c.length).filter((l): l is number => l !== null);
  if (!lens.length) return null;
  return {
    count: lens.length,
    avg: lens.reduce((a, b) => a + b, 0) / lens.length,
    min: Math.min(...lens),
    max: Math.max(...lens),
  };
}
