import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import Dexie from 'dexie';
import { DiaryDB } from '../src/db/schema';
import { getSettings } from '../src/db/repo';
import { DATA_VERSION } from '../src/db/defaults';

// Имитация базы, созданной версией приложения 0.5.0 (схема 1), с вымышленными данными
async function createV1(name: string) {
  const old = new Dexie(name);
  old.version(1).stores({
    days: '&date, completed, updatedAt',
    items: '&id, kind, name, favorite, archived',
    events: '&id, date, ts, itemId, kind, [date+ts]',
    settings: '&key',
  });
  await old.open();
  await old.table('settings').add({ key: 'app', dayStartsAt: '05:00', symptomMinIntensity: 1, shortSleepMin: 360, longSleepMin: 540, lagDays: [0, 1, 2], theme: 'auto', version: 1, lastExportAt: 123 });
  await old.table('items').add({ id: 'i1', kind: 'supplement', name: 'Добавка-Тест', tags: [], favorite: true, archived: false, useCount: 3, createdAt: 1 });
  await old.table('events').bulkAdd([
    { id: 'e1', date: '2026-11-01', ts: 1, itemId: 'i1', kind: 'supplement' },
    { id: 'e2', date: '2026-11-02', ts: 2, itemId: 'i1', kind: 'supplement', amountText: '1 шт.' },
  ]);
  await old.table('days').add({ date: '2026-11-01', completed: true, flow: 2, updatedAt: 1, sleep: { bedtime: '23:00', wake: '07:00', durationMin: 480 } });
  old.close();
}

describe('миграция схемы 1 → 2', () => {
  it('все старые данные сохраняются, новые таблицы появляются', async () => {
    await createV1('mig-1');
    const db = new DiaryDB('mig-1');
    await db.open();
    expect(db.verno).toBe(DATA_VERSION);
    // стартовый справочник не добавляется к существующей базе; версия 3 добавляет «вздутие живота» со ★
    expect((await db.items.toArray()).sort((a, b) => a.createdAt - b.createdAt).map((i) => [i.name, i.favorite])).toEqual([['Добавка-Тест', true], ['вздутие живота', true]]);
    expect(await db.events.toArray()).toEqual([
      { id: 'e1', date: '2026-11-01', ts: 1, itemId: 'i1', kind: 'supplement' },
      { id: 'e2', date: '2026-11-02', ts: 2, itemId: 'i1', kind: 'supplement', amountText: '1 шт.' },
    ]);
    expect((await db.days.get('2026-11-01'))?.sleep?.durationMin).toBe(480);
    const s = await getSettings(db);
    expect(s.dayStartsAt).toBe('05:00');
    expect(s.lastExportAt).toBe(123);
    expect(s.version).toBe(3);
    expect(await db.courses.count()).toBe(0);
    expect(await db.metrics.count()).toBe(0);
    await db.delete();
  });
});

describe('миграция 2 → 3: вздутие в чек-листе', () => {
  it('существующий симптом со словом «вздутие» получает ★, новый не создаётся, архивный не трогается', async () => {
    await createV1('mig-3');
    const old = new Dexie('mig-3');
    old.version(1).stores({ items: '&id, kind, name, favorite, archived' });
    await old.open();
    await old.table('items').bulkAdd([
      { id: 'b1', kind: 'symptom', name: 'Вздутие', tags: [], favorite: false, archived: false, useCount: 0, createdAt: 2 },
      { id: 'b2', kind: 'symptom', name: 'вздутие старое', tags: [], favorite: false, archived: true, useCount: 0, createdAt: 3 },
    ]);
    old.close();
    const db = new DiaryDB('mig-3');
    await db.open();
    const items = await db.items.toArray();
    expect(items.find((i) => i.id === 'b1')!.favorite).toBe(true);
    expect(items.find((i) => i.id === 'b2')!.favorite).toBe(false);
    expect(items.filter((i) => /вздути/i.test(i.name))).toHaveLength(2);
    await db.delete();
  });
});
