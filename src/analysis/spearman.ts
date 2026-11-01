// Ранговая корреляция Спирмена: насколько согласованно растут (или падают) два ряда.
// Ранги считаются с учётом одинаковых значений (средний ранг), затем — корреляция Пирсона рангов.
// p-значение — через t-распределение: t = rho·√((n−2)/(1−rho²)), df = n − 2.

/** Ранги с усреднением при совпадениях: [10, 20, 20, 30] → [1, 2.5, 2.5, 4]. */
export function ranks(values: number[]): number[] {
  const idx = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const r = new Array<number>(values.length);
  let k = 0;
  while (k < idx.length) {
    let j = k;
    while (j + 1 < idx.length && idx[j + 1]!.v === idx[k]!.v) j++;
    const avg = (k + j) / 2 + 1;
    for (let t = k; t <= j; t++) r[idx[t]!.i] = avg;
    k = j + 1;
  }
  return r;
}

export function pearson(x: number[], y: number[]): number | null {
  const n = x.length;
  if (n < 3) return null;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i]! - mx;
    const dy = y[i]! - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null; // один из рядов постоянный — корреляция не определена
  return sxy / Math.sqrt(sxx * syy);
}

export function spearman(x: number[], y: number[]): number | null {
  return pearson(ranks(x), ranks(y));
}

// ---------- t-распределение через регуляризованную неполную бета-функцию ----------

/** ln Γ(x), приближение Ланцоша (точность ~1e-15). */
export function logGamma(x: number): number {
  const g = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let a = g[0]!;
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += g[i]! / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Цепная дробь для неполной бета-функции (метод Ленца). */
function betaContinuedFraction(a: number, b: number, x: number): number {
  const TINY = 1e-300;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-12) break;
  }
  return h;
}

/** Регуляризованная неполная бета-функция I_x(a, b). */
export function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (front * betaContinuedFraction(a, b, x)) / a : 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

/** Двусторонний p-value для коэффициента корреляции r при n парах. */
export function correlationPValue(r: number, n: number): number {
  const df = n - 2;
  if (df <= 0) return 1;
  if (Math.abs(r) >= 1) return 0;
  const t2 = (r * r * df) / (1 - r * r);
  return incompleteBeta(df / (df + t2), df / 2, 0.5);
}
