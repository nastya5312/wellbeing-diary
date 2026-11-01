import { describe, it, expect } from 'vitest';
import type { Item } from '../src/models/types';
import { guessKind, matchScore, parseQuick, stem } from '../src/lib/quickParse';

const mk = (id: string, kind: Item['kind'], name: string, useCount = 0): Item => ({ id, kind, name, tags: [], favorite: true, archived: false, useCount, createdAt: 0 });
// Вымышленный справочник
const items = [
  mk('c', 'drink', 'кофе', 5), mk('t', 'drink', 'чай'), mk('o', 'food', 'овсянка'), mk('y', 'food', 'тест-йогурт'),
  mk('b', 'symptom', 'вздутие живота'), mk('h', 'symptom', 'головная боль'), mk('p', 'symptom', 'боль в животе'),
  mk('ch', 'food', 'куриное филе'), mk('m', 'med', 'тест-препарат'),
];

describe('основы слов', () => {
  it('падежи сводятся к одной основе', () => {
    expect(stem('овсянку')).toBe(stem('овсянка'));
    expect(stem('головной')).toBe(stem('головная'));
    expect(matchScore('съела овсянку', 'овсянка')).toBeGreaterThan(0);
    expect(matchScore('куриного филе', 'куриное филе')).toBeGreaterThan(0);
    expect(matchScore('кофе', 'чай')).toBe(0);
  });
});

describe('разбор фразы', () => {
  it('несколько записей, время, сила симптома', () => {
    const r = parseQuick('Выпила кофе в 8:30, съела овсянку и вздутие живота сильное', items);
    expect(r.map((p) => [p.item?.id, p.time, p.intensity])).toEqual([
      ['c', '08:30', undefined],
      ['o', undefined, undefined],
      ['b', undefined, 4],
    ]);
  });
  it('из двух подходящих берётся более полное совпадение', () => {
    const r = parseQuick('боль в животе 3', items);
    expect(r[0]!.item?.id).toBe('p');
    expect(r[0]!.intensity).toBe(3);
    expect(parseQuick('головная боль очень сильная', items)[0]).toMatchObject({ item: { id: 'h' }, intensity: 5 });
  });
  it('незнакомое — предложение создать новую позицию', () => {
    const r = parseQuick('гречка в 13, кофе', items);
    expect(r[0]).toMatchObject({ newName: 'гречка', time: '13:00' });
    expect(r[1]!.item?.id).toBe('c');
  });
  it('догадка о типе новой позиции', () => {
    expect(guessKind('понос')).toBe('symptom');
    expect(guessKind('сок')).toBe('drink');
    expect(guessKind('гречка')).toBe('food');
  });
});
