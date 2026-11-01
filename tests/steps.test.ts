import { describe, it, expect } from 'vitest';
import { extractDate, extractNumber, parseStepsText } from '../src/lib/stepsImport';

describe('разбор шагов из буфера', () => {
  it('даты в разных форматах', () => {
    expect(extractDate('2026-10-31 12345')?.date).toBe('2026-10-31');
    expect(extractDate('31.10.2026; 12 345')?.date).toBe('2026-10-31');
    expect(extractDate('1.11.26 900')?.date).toBe('2026-11-01');
    expect(extractDate('31 окт. 2026 г. 8 120 шаг.')?.date).toBe('2026-10-31');
    expect(extractDate('5 мая 2026 100')?.date).toBe('2026-05-05');
    expect(extractDate('31.02.2026 5')).toBeNull();
  });
  it('числа с пробелами-разделителями и дробной частью', () => {
    expect(extractNumber(' 12 345 шаг.')).toBe(12345);
    expect(extractNumber('12345.0')).toBe(12345);
    expect(extractNumber('12 345,6')).toBe(12345.6);
  });
  it('несколько строк, сумма за одну дату, непонятное пропускается', () => {
    const r = parseStepsText('2026-10-30 1000\n2026-10-30 2500.5\n31.10.2026 12 345 шаг.\nпривет\n2026-11-01 999999');
    expect(r.days).toEqual([
      { date: '2026-10-30', steps: 3501 },
      { date: '2026-10-31', steps: 12345 },
    ]);
    expect(r.skipped).toEqual(['привет', '2026-11-01 999999']);
    expect(r.undated).toBeNull();
  });
  it('одно число без даты', () => {
    expect(parseStepsText('8 431').undated).toBe(8431);
  });
});
