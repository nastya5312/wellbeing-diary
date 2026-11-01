// Поиск похожих названий, чтобы не плодить дубли в справочнике («Кофе» и «кофе », «йогурт» и «йогурты»).

export function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
}

/** Расстояние Левенштейна: сколько букв нужно заменить, вставить или удалить. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length]!;
}

/** Похожи ли названия: совпадают, одно начинается с другого, или отличаются на 1–2 буквы. */
export function isSimilarName(a: string, b: string): boolean {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length >= 3 && long.startsWith(short)) return true;
  const allowed = short.length >= 8 ? 2 : short.length >= 4 ? 1 : 0;
  return levenshtein(x, y) <= allowed;
}

/** Подходит ли позиция под строку поиска. */
export function matchesSearch(name: string, query: string): boolean {
  const q = normalizeName(query);
  return !q || normalizeName(name).includes(q);
}
