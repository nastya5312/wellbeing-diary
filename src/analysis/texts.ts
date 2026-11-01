// Формулировки выводов (ТЗ, 7.9). Разрешено: «совпадает», «чаще», «реже», «наблюдается после», «гипотеза».
// Запрещено: «вызывает», «из-за», «причина», «вам нужно», «рекомендуется» и любые советы по лекарствам.
import type { Category, Correlation, Signal } from './analyze';
import { RR_HIGH, RR_LOW } from './thresholds';

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

const ratio = (a: number, n: number) => `${a} из ${n}`;

/** Предупреждения о совпадающих факторах (ТЗ, 7.7). */
export function confoundTexts(s: Signal): string[] {
  const F = `«${s.factorLabel}»`;
  const out: string[] = [];
  for (const c of s.confounds) {
    const G = `«${c.gLabel}»`;
    out.push(`${F} часто совпадает с ${G} (в ${ratio(c.both, c.fDays)} дней). По этим данным нельзя разделить влияние.`);
    if (c.inseparable) {
      out.push(`Разделить невозможно: ${F} всегда встречается вместе с ${G}.`);
    } else if (!c.strata) {
      out.push(`Без ${G} ${F} было только ${c.fWithoutG} ${c.fWithoutG === 1 ? 'раз' : c.fWithoutG < 5 ? 'раза' : 'раз'} — для раздельного пересчёта нужно хотя бы 3 дня в каждой группе.`);
    } else {
      const { withG: w, withoutG: wo, mh } = c.strata;
      const part = (name: string, t: typeof w) =>
        t.c + t.d === 0
          ? `${name}: ${ratio(t.a, t.a + t.b)} после ${F}, дней без ${F} нет — сравнивать не с чем.`
          : `${name}: ${ratio(t.a, t.a + t.b)} после ${F} против ${ratio(t.c, t.c + t.d)} без него (RR ${rrText(t.rr)}).`;
      out.push(`${part(`Отдельно в дни с ${G}`, w)} ${part(`В дни без ${G}`, wo)} С учётом ${G} (Мантель–Хензель): RR ${rrText(mh)}.`);
      const holds = mh !== null && (s.direction === 'more' ? mh >= RR_HIGH : mh <= RR_LOW);
      if (!holds) out.push(`После учёта ${G} разница почти исчезает.`);
    }
  }
  return out;
}

const cases = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'случая' : 'случаев'}`;
const pctOf = (a: number, n: number) => (n ? ` (${Math.round((a / n) * 100)}%)` : '');

/** Заголовок «Повторов». */
export function repeatsTitle(factorLabel: string, occasions: number): string {
  return `После ${cases(occasions)} «${factorLabel}»`;
}

/** Строка «Повторов» для одного сдвига. */
export function repeatsLine(outcomeLabel: string, l: { lag: number; a: number; n: number; c: number; m: number }): string {
  const when = l.lag === 0 ? 'в тот же день' : l.lag === 1 ? 'на следующий день' : `через ${l.lag} дня`;
  if (l.n === 0) return `«${outcomeLabel}» ${when}: нет заполненных дней для сравнения.`;
  return `«${outcomeLabel}» ${when} — в ${l.a} из ${l.n}${pctOf(l.a, l.n)}. В остальные заполненные дни — ${l.c} из ${l.m}${pctOf(l.c, l.m)}.`;
}

/** Запрещённые слова — проверяются тестом во всех формулировках. */
export const FORBIDDEN_WORDS = [/вызыва/i, /из-за/i, /причин[аы]/i, /вам нужно/i, /рекоменд/i, /принимать/i, /лечить/i];

// ---------- «Почему так?» ----------
const n1 = (x: number) => x.toFixed(1).replace('.', ',');

export function whyTitle(c: { label: string; windowLabel: string }, symptom: string): string {
  return `«${c.label}» ${c.windowLabel} «${symptom}»`;
}

export function whyDetails(c: { observed: number; cases: number; expected: number; ratio: number }): string {
  const base = `Было перед ${c.observed} из ${c.cases} эпизодов.`;
  if (c.ratio === Infinity) return `${base} В те же часы в другие дни не бывало ни разу.`;
  return `${base} При обычном распорядке ожидалось бы около ${n1(c.expected)} — это в ${n1(c.ratio)} раза чаще.`;
}

export function whyBackgroundText(b: { label: string; withSymptom: number; episodeDays: number; other: number; otherDays: number }, symptom: string): string {
  const pc = (a: number, n: number) => `${Math.round((a / n) * 100)}%`;
  return `«${symptom}» чаще совпадает с днями «${b.label}»: ${b.withSymptom} из ${b.episodeDays} (${pc(b.withSymptom, b.episodeDays)}) против ${b.other} из ${b.otherDays} (${pc(b.other, b.otherDays)}) в остальные дни.`;
}

export function hoursAgoText(h: number): string {
  if (h < 1) return 'меньше часа до';
  if (h < 24) return `за ${Math.round(h)} ч до`;
  const d = Math.floor(h / 24);
  const rest = Math.round(h - d * 24);
  return rest ? `за ${d} сут ${rest} ч до` : `за ${d} сут до`;
}
