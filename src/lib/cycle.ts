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
