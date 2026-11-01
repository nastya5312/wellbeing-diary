import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DiaryDB } from '../src/db/schema';
import { DEFAULT_SETTINGS } from '../src/db/defaults';
import {
  addEvent, addItem, deleteEvent, getDay, getSettings, listDays, listEventsByDate, listEventsRange,
  listItems, saveDay, updateEvent, updateItem, updateSettings,
} from '../src/db/repo';

// Только вымышленные данные. Каждая проверка — на своей чистой базе.
let db: DiaryDB;
let n = 0;
const at = (iso: string) => new Date(iso).getTime();

beforeEach(async () => {
  db = new DiaryDB(`test-${++n}`);
  await db.open();
});
afterEach(async () => {
  await db.delete();
});

describe('первый запуск', () => {
  it('настройки по умолчанию', async () => {
    expect(await getSettings(db)).toEqual(DEFAULT_SETTINGS);
  });
  it('стартовый справочник: 8 симптомов, 4 напитка, без лекарств', async () => {
    expect((await listItems(db, { kind: 'symptom' })).map((i) => i.name)).toEqual([
      'прыщи', 'головная боль', 'боль внизу живота', 'тошнота', 'вздутие', 'усталость', 'отёки', 'изжога',
    ]);
    expect(await listItems(db, { kind: 'drink' })).toHaveLength(4);
    expect(await listItems(db, { kind: 'med' })).toHaveLength(0);
    expect(await listItems(db, { kind: 'supplement' })).toHaveLength(0);
  });
});

describe('настройки', () => {
  it('сохраняются и проверяются', async () => {
    await updateSettings(db, { dayStartsAt: '05:00', lagDays: [0, 1] });
    const s = await getSettings(db);
    expect(s.dayStartsAt).toBe('05:00');
    expect(s.lagDays).toEqual([0, 1]);
    expect(s.shortSleepMin).toBe(360);
    await expect(updateSettings(db, { dayStartsAt: '5 утра' })).rejects.toThrow();
    await expect(updateSettings(db, { lagDays: [-1] })).rejects.toThrow();
  });
  it('новые поля получают значения по умолчанию, если в базе их нет', async () => {
    // Имитация записи старой версии приложения без части полей
    await db.settings.put({ key: 'app', dayStartsAt: '03:00', version: 1 } as never);
    const s = await getSettings(db);
    expect(s.dayStartsAt).toBe('03:00');
    expect(s.longSleepMin).toBe(540);
  });
});

describe('дни', () => {
  it('частичное сохранение сливает сон и самочувствие', async () => {
    await saveDay(db, '2026-11-01', { sleep: { bedtime: '23:30', wake: '07:15', durationMin: 465 } });
    await saveDay(db, '2026-11-01', { sleep: { quality: 4 }, wellbeing: { mood: 3 } });
    await saveDay(db, '2026-11-01', { wellbeing: { energy: 2 }, flow: 1 });
    const d = await getDay(db, '2026-11-01');
    expect(d?.sleep).toEqual({ bedtime: '23:30', wake: '07:15', durationMin: 465, quality: 4 });
    expect(d?.wellbeing).toEqual({ mood: 3, energy: 2 });
    expect(d?.flow).toBe(1);
    expect(d?.completed).toBe(false);
  });
  it('«День заполнен» ставится и снимается', async () => {
    await saveDay(db, '2026-11-01', { completed: true });
    expect((await getDay(db, '2026-11-01'))?.completed).toBe(true);
    await saveDay(db, '2026-11-01', { note: 'вымышленная заметка' });
    expect((await getDay(db, '2026-11-01'))?.completed).toBe(true);
    await saveDay(db, '2026-11-01', { completed: false });
    expect((await getDay(db, '2026-11-01'))?.completed).toBe(false);
  });
  it('диапазон дат и неверная дата', async () => {
    for (const d of ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']) await saveDay(db, d, { completed: true });
    expect((await listDays(db, '2026-10-31', '2026-11-01')).map((d) => d.date)).toEqual(['2026-10-31', '2026-11-01']);
    await expect(saveDay(db, '2026-13-01', {})).rejects.toThrow();
  });
});

describe('справочник', () => {
  it('создание, теги, архив', async () => {
    const it1 = await addItem(db, { kind: 'food', name: '  Тестовый сыр ', tags: ['Молочное', 'молочное', ' '] });
    expect(it1.name).toBe('Тестовый сыр');
    expect(it1.tags).toEqual(['молочное']);
    await updateItem(db, it1.id, { archived: true });
    expect(await listItems(db, { kind: 'food' })).toHaveLength(0);
    expect(await listItems(db, { kind: 'food', includeArchived: true })).toHaveLength(1);
    await expect(addItem(db, { kind: 'food', name: '   ' })).rejects.toThrow();
  });
});

describe('события', () => {
  it('дата считается по границе дня, счётчик использований растёт', async () => {
    const med = await addItem(db, { kind: 'med', name: 'Лекарство-Альфа' });
    const ev = await addEvent(db, { itemId: med.id, ts: at('2026-11-02T02:30:00'), amountText: ' 1 таблетка ' });
    expect(ev.date).toBe('2026-11-01');
    expect(ev.kind).toBe('med');
    expect(ev.amountText).toBe('1 таблетка');
    expect((await db.items.get(med.id))?.useCount).toBe(1);
  });
  it('граница дня из настроек', async () => {
    await updateSettings(db, { dayStartsAt: '02:00' });
    const food = await addItem(db, { kind: 'food', name: 'Тестовое блюдо' });
    const ev = await addEvent(db, { itemId: food.id, ts: at('2026-11-02T02:30:00') });
    expect(ev.date).toBe('2026-11-02');
  });
  it('явная дата задним числом', async () => {
    const food = await addItem(db, { kind: 'food', name: 'Тестовое блюдо' });
    const ev = await addEvent(db, { itemId: food.id, ts: at('2026-11-05T12:00:00'), date: '2026-10-20' });
    expect(ev.date).toBe('2026-10-20');
  });
  it('список дня по времени, правка, удаление', async () => {
    const [sym] = await listItems(db, { kind: 'symptom' });
    const e1 = await addEvent(db, { itemId: sym!.id, ts: at('2026-11-01T18:00:00'), intensity: 3 });
    const e2 = await addEvent(db, { itemId: sym!.id, ts: at('2026-11-01T09:00:00'), intensity: 2 });
    await addEvent(db, { itemId: sym!.id, ts: at('2026-11-02T09:00:00'), intensity: 1 });
    expect((await listEventsByDate(db, '2026-11-01')).map((e) => e.id)).toEqual([e2.id, e1.id]);
    await updateEvent(db, e1.id, { intensity: 5 });
    expect((await db.events.get(e1.id))?.intensity).toBe(5);
    await deleteEvent(db, e2.id);
    expect(await listEventsByDate(db, '2026-11-01')).toHaveLength(1);
    expect(await listEventsRange(db, '2026-11-01', '2026-11-02')).toHaveLength(2);
  });
  it('событие с несуществующей позицией не сохраняется', async () => {
    await expect(addEvent(db, { itemId: 'нет-такой', ts: Date.now() })).rejects.toThrow();
    expect(await db.events.count()).toBe(0);
  });
});

describe('сохранность', () => {
  it('данные переживают закрытие и повторное открытие базы', async () => {
    const name = db.name;
    const food = await addItem(db, { kind: 'food', name: 'Тестовое блюдо' });
    await addEvent(db, { itemId: food.id, ts: at('2026-11-01T12:00:00') });
    await saveDay(db, '2026-11-01', { completed: true });
    db.close();

    const reopened = new DiaryDB(name);
    await reopened.open();
    expect(await reopened.events.count()).toBe(1);
    expect((await reopened.days.get('2026-11-01'))?.completed).toBe(true);
    // Стартовый справочник не добавляется повторно
    expect(await reopened.items.where('kind').equals('symptom').count()).toBe(8);
    db = reopened; // удалится в afterEach
  });
});
