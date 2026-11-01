import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { parseList } from '../src/lib/pasteList';
import { DiaryDB } from '../src/db/schema';
import { importListEntries, listItems } from '../src/db/repo';

// Вымышленный список того же вида, что выдаёт Claude: заголовки, пояснения, пустые теги, тире, скобки
const SAMPLE = `01.01.2030 10:00 (Город)
Лекарство: препарат-альфа
Добавка: витамин Тест
Симптом: боль в (вымышленном) месте 3–5 утра
Еда: тестовое блюдо |
Еда: сырники-тест | Молочное, глютен , жареное
Напиток: кофе
Активность: прогулка с тестом
Что стоит проверить:

* Подтверждено 01.01.2030: препарат-альфа, витамин Тест.
- Добавка: витамин тест
Неизвестно: что-то`;

describe('разбор вставленного списка', () => {
  const { entries, skipped } = parseList(SAMPLE);

  it('распознаёт позиции всех типов', () => {
    expect(entries.map((e) => `${e.kind}:${e.name}`)).toEqual([
      'med:препарат-альфа',
      'supplement:витамин Тест',
      'symptom:боль в (вымышленном) месте 3–5 утра',
      'food:тестовое блюдо',
      'food:сырники-тест',
      'drink:кофе',
      'activity:прогулка с тестом',
    ]);
  });
  it('теги: пустые после «|» и с пробелами/регистром', () => {
    expect(entries.find((e) => e.name === 'тестовое блюдо')?.tags).toEqual([]);
    expect(entries.find((e) => e.name === 'сырники-тест')?.tags).toEqual(['молочное', 'глютен', 'жареное']);
  });
  it('пропускает заголовки, пояснения и повторы', () => {
    // дата, «Что стоит проверить», «* Подтверждено…», «Неизвестно: …»; повтор «- Добавка: витамин тест» не дублируется
    expect(skipped).toBe(4);
  });
});

describe('добавление списка в справочник', () => {
  it('новые создаются избранными, существующие не дублируются', async () => {
    const db = new DiaryDB('paste-1');
    await db.open();
    const { entries } = parseList(SAMPLE);
    const res = await importListEntries(db, entries, true);
    expect(res).toEqual({ added: 6, updated: 1 }); // «кофе» уже есть в стартовом справочнике
    const drinks = await listItems(db, { kind: 'drink' });
    expect(drinks.filter((d) => d.name === 'кофе')).toHaveLength(1);
    expect(drinks.find((d) => d.name === 'кофе')?.favorite).toBe(true);
    // Повторная вставка ничего не добавляет
    expect(await importListEntries(db, entries, true)).toEqual({ added: 0, updated: 7 });
    await db.delete();
  });
});
