// Точный критерий Фишера для таблицы 2×2 (двусторонний).
//
//            результат есть  результата нет
// фактор есть       a              b
// фактора нет       c              d
//
// При фиксированных суммах строк и столбцов число a распределено гипергеометрически:
// P(a) = C(a+b, a) · C(c+d, c) / C(n, a+c).
// Двусторонний p = сумма вероятностей всех таблиц, которые не вероятнее наблюдаемой.
// Факториалы считаются через логарифмы, чтобы не переполнялись числа.

const logFactCache: number[] = [0];

export function logFactorial(n: number): number {
  for (let i = logFactCache.length; i <= n; i++) logFactCache[i] = logFactCache[i - 1]! + Math.log(i);
  return logFactCache[n]!;
}

function logChoose(n: number, k: number): number {
  return logFactorial(n) - logFactorial(k) - logFactorial(n - k);
}

export function fisherExact(a: number, b: number, c: number, d: number): number {
  const row1 = a + b;
  const row2 = c + d;
  const col1 = a + c;
  const n = row1 + row2;
  if (n === 0) return 1;
  const logDen = logChoose(n, col1);
  const logP = (x: number) => logChoose(row1, x) + logChoose(row2, col1 - x) - logDen;
  const observed = logP(a);
  const lo = Math.max(0, col1 - row2);
  const hi = Math.min(row1, col1);
  let p = 0;
  for (let x = lo; x <= hi; x++) {
    const lp = logP(x);
    // Допуск на погрешность округления, как в R (relErr = 1 + 1e-7)
    if (lp <= observed + 1e-7) p += Math.exp(lp);
  }
  return Math.min(1, p);
}
