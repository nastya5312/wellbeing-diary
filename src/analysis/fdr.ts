// Поправка Бенджамини–Хохберга на множественные сравнения.
// Когда проверяются сотни пар «фактор → результат», часть из них случайно даст маленький p.
// q-значение — это ожидаемая доля ложных находок среди всех находок с таким же или меньшим p.
// q_i = min по j ≥ i от (p_j · m / j), где p отсортированы по возрастанию, m — число проверок.

export function benjaminiHochberg(pValues: number[]): number[] {
  const m = pValues.length;
  const order = pValues.map((p, i) => ({ p, i })).sort((x, y) => x.p - y.p);
  const q = new Array<number>(m);
  let running = 1;
  for (let k = m - 1; k >= 0; k--) {
    const { p, i } = order[k]!;
    running = Math.min(running, (p * m) / (k + 1));
    q[i] = Math.min(1, running);
  }
  return q;
}
