import { describe, it, expect } from 'vitest';
import { fisherExact, logFactorial } from '../src/analysis/fisher';
import { benjaminiHochberg } from '../src/analysis/fdr';
import { correlationPValue, incompleteBeta, logGamma, pearson, ranks, spearman } from '../src/analysis/spearman';

describe('точный критерий Фишера (эталоны: R fisher.test и scipy.stats.fisher_exact)', () => {
  it('«дама пробует чай» [[3,1],[1,3]] → p = 0.4857', () => expect(fisherExact(3, 1, 1, 3)).toBeCloseTo(0.485714, 5));
  it('[[1,9],[11,3]] → p = 0.002759', () => expect(fisherExact(1, 9, 11, 3)).toBeCloseTo(0.0027595, 6));
  it('[[10,0],[0,10]] → p = 2/C(20,10)', () => expect(fisherExact(10, 0, 0, 10)).toBeCloseTo(2 / 184756, 10));
  it('[[8,2],[1,5]] → p = 0.03497', () => expect(fisherExact(8, 2, 1, 5)).toBeCloseTo(0.034965, 5));
  it('симметрия и граничные случаи', () => {
    expect(fisherExact(1, 9, 11, 3)).toBeCloseTo(fisherExact(11, 3, 1, 9), 12);
    expect(fisherExact(0, 0, 0, 0)).toBe(1);
    expect(fisherExact(5, 5, 5, 5)).toBeCloseTo(1, 10);
  });
  it('логарифм факториала', () => {
    expect(Math.exp(logFactorial(10))).toBeCloseTo(3628800, 0);
    expect(logFactorial(0)).toBe(0);
  });
});

describe('Бенджамини–Хохберг (эталон R: p.adjust(method = "BH"))', () => {
  it('известный пример', () => {
    const p = [0.01, 0.04, 0.03, 0.005];
    // R: p.adjust(c(0.01,0.04,0.03,0.005),"BH") → 0.02 0.04 0.04 0.02
    benjaminiHochberg(p).forEach((q, i) => expect(q).toBeCloseTo([0.02, 0.04, 0.04, 0.02][i]!, 10));
  });
  it('q не меньше p, не больше 1, монотонность сохраняется', () => {
    const p = [0.9, 0.001, 0.2, 0.5, 0.04];
    const q = benjaminiHochberg(p);
    q.forEach((x, i) => {
      expect(x).toBeGreaterThanOrEqual(p[i]!);
      expect(x).toBeLessThanOrEqual(1);
    });
    expect(q[1]!).toBeLessThanOrEqual(q[4]!);
    expect(benjaminiHochberg([])).toEqual([]);
  });
});

describe('Спирмен', () => {
  it('ранги с совпадениями', () => expect(ranks([10, 20, 20, 30])).toEqual([1, 2.5, 2.5, 4]));
  it('монотонная связь = 1, обратная = −1', () => {
    expect(spearman([1, 2, 3, 4, 5], [2, 4, 9, 16, 100])).toBeCloseTo(1, 12);
    expect(spearman([1, 2, 3, 4, 5], [5, 4, 3, 2, 1])).toBeCloseTo(-1, 12);
  });
  it('пример с совпадениями (эталон scipy.stats.spearmanr = 0.8090909)', () => {
    expect(spearman([1, 2, 2, 3, 4, 5, 6], [2, 1, 3, 3, 6, 4, 5])).toBeCloseTo(0.8090909, 6);
    // p-value того же примера: scipy 0.0275166
    expect(correlationPValue(0.8090909090909091, 7)).toBeCloseTo(0.0275166, 6);
  });
  it('постоянный ряд — не определено', () => expect(pearson([1, 1, 1, 1], [1, 2, 3, 4])).toBeNull());
  it('p-value: r = 0.5, n = 20 → 0.0247696 (эталон scipy, t-распределение, df = 18)', () =>
    expect(correlationPValue(0.5, 20)).toBeCloseTo(0.0247696, 6));
  it('p-value: r = 0, любое n → 1', () => expect(correlationPValue(0, 30)).toBeCloseTo(1, 10));
  it('гамма и неполная бета', () => {
    expect(Math.exp(logGamma(5))).toBeCloseTo(24, 8);
    expect(Math.exp(logGamma(0.5))).toBeCloseTo(Math.sqrt(Math.PI), 10);
    expect(incompleteBeta(0.5, 2, 2)).toBeCloseTo(0.5, 12);
    expect(incompleteBeta(0.3, 1, 1)).toBeCloseTo(0.3, 12);
    expect(incompleteBeta(0.2, 3, 5)).toBeCloseTo(0.148032, 6); // scipy.special.betainc(3, 5, 0.2)
  });
});
