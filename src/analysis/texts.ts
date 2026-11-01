// Формулировки выводов (ТЗ, 7.9). Разрешено: «совпадает», «чаще», «реже», «наблюдается после», «гипотеза».
// Запрещено: «вызывает», «из-за», «причина», «вам нужно», «рекомендуется» и любые советы по лекарствам.
import type { Category, Correlation, Signal } from './analyze';

export const DISCLAIMER = 'Это совпадения в твоих записях, а не диагноз и не доказанная причина. Обсуждай с врачом.';

export const CATEGORY_LABEL: Record<Category, string> = {
  weak: 'слабый сигнал',
  notable: 'заметный сигнал',
  strong: 'сильный сигнал',
};

export function lagText(lag: number): string {
  if (lag === 0) return 'в тот же день (порядок событий внутри дня неизвестен)';
  if (lag === 1) return 'на следующий день';
  return `через ${lag} дн.`;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function rrText(rr: number | null): string {
  if (rr === null) return 'не определено';
  if (rr === Infinity) return 'не определено (без фактора не встречалось)';
  return `${rr.toFixed(1).replace('.', ',')}×`;
}

export function signalTitle(s: Signal): string {
  const when = lagText(s.lag);
  return s.direction === 'more'
    ? `«${s.outcomeLabel}» чаще наблюдается ${when} после «${s.factorLabel}»`
    : `«${s.outcomeLabel}» реже наблюдается ${when} после «${s.factorLabel}»`;
}

export function signalDetails(s: Signal): string {
  return `После «${s.factorLabel}»: ${s.a} из ${s.a + s.b} (${pct(s.rateWith)}). В остальные заполненные дни: ${s.c} из ${s.c + s.d} (${pct(s.rateWithout)}).`;
}

export function correlationTitle(c: Correlation): string {
  const dir = c.rho > 0 ? 'выше' : 'ниже';
  const when = c.lag === 0 ? 'в тот же день' : 'на следующий день';
  return `Чем больше «${c.xLabel}», тем ${dir} «${c.yLabel}» ${when}`;
}

export function correlationDetails(c: Correlation): string {
  return `Коэффициент Спирмена ${c.rho.toFixed(2).replace('.', ',')}, пар дней: ${c.pairs}.`;
}

/** Запрещённые слова — проверяются тестом во всех формулировках. */
export const FORBIDDEN_WORDS = [/вызыва/i, /из-за/i, /причин[аы]/i, /вам нужно/i, /рекоменд/i, /принимать/i, /лечить/i];
