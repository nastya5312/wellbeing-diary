// Проверка перемешиванием с циклическим сдвигом.
// Сдвигаем ряд результата по кругу на k дней: внутренняя «серийность» обоих рядов сохраняется,
// а связь между ними разрушается. Если настоящее совпадение не лучше, чем у большинства сдвигов, —
// это, скорее всего, совпадение серий, а не закономерность.

/** Детерминированный генератор случайных чисел (mulberry32): одинаковые данные → одинаковый результат. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * p-значение перемешивания: доля сдвигов, где статистика не хуже наблюдаемой.
 * stat(shift) — статистика при сдвиге (shift = 0 — настоящие данные). Больше — сильнее связь.
 * Сдвиги ближе minGap дней не используются: они почти совпадают с исходным выравниванием.
 */
export function circularShiftPValue(n: number, stat: (shift: number) => number | null, permutations: number, seed: number, minGap = 7): number {
  const observed = stat(0);
  if (observed === null || n < 2 * minGap + 2) return 1;
  const random = rng(seed);
  let worse = 0;
  let total = 0;
  for (let k = 0; k < permutations; k++) {
    const shift = minGap + Math.floor(random() * (n - 2 * minGap));
    const s = stat(shift);
    if (s === null) continue;
    total++;
    if (s >= observed - 1e-12) worse++;
  }
  return (worse + 1) / (total + 1);
}
