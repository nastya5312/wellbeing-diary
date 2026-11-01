// Таблица 2×2 для тройки (фактор F в день D, результат O в день D + lag).
// Пара дней учитывается, только если оба значения известны (оба дня заполнены и данные есть).
import type { Value } from './factors';

export type Table2x2 = { a: number; b: number; c: number; d: number };

export function buildTable(f: Value[], o: Value[], lag: number, shift = 0): Table2x2 {
  const n = f.length;
  const t = { a: 0, b: 0, c: 0, d: 0 };
  for (let i = 0; i + lag < n; i++) {
    const fi = f[i];
    // shift — циклический сдвиг ряда результата для проверки перемешиванием (0 — без сдвига)
    const j = shift ? (i + lag + shift) % n : i + lag;
    const oj = o[j];
    if (fi === undefined || oj === undefined) continue;
    if (fi) {
      if (oj) t.a++;
      else t.b++;
    } else if (oj) t.c++;
    else t.d++;
  }
  return t;
}

/** Доля результата при факторе и без него. */
export function rates(t: Table2x2): { withF: number | null; withoutF: number | null } {
  return {
    withF: t.a + t.b > 0 ? t.a / (t.a + t.b) : null,
    withoutF: t.c + t.d > 0 ? t.c / (t.c + t.d) : null,
  };
}

/**
 * Отношение рисков RR = доля при факторе / доля без фактора.
 * null — не определено (нет дней без фактора или нет дней с фактором).
 * Infinity — без фактора результат не встречался ни разу.
 */
export function riskRatio(t: Table2x2): number | null {
  const { withF, withoutF } = rates(t);
  if (withF === null || withoutF === null) return null;
  if (withoutF === 0) return withF === 0 ? null : Infinity;
  return withF / withoutF;
}

/** Коэффициент phi — согласованность двух бинарных рядов в одни и те же дни (−1…1). */
export function phi(x: Value[], y: Value[]): { phi: number | null; both: number; days: number } {
  const t = buildTable(x, y, 0);
  const n = t.a + t.b + t.c + t.d;
  const den = Math.sqrt((t.a + t.b) * (t.c + t.d) * (t.a + t.c) * (t.b + t.d));
  return { phi: den === 0 ? null : (t.a * t.d - t.b * t.c) / den, both: t.a, days: n };
}
