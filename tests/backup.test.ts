import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DiaryDB } from '../src/db/schema';
import { addEvent, addItem, saveDay, updateSettings, listItems } from '../src/db/repo';
import { addMeasurement, addMetric, startCourse, endCourse } from '../src/db/courses';
import { backupOverdue, createBackup, importBackup, validateBackup, type BackupFile } from '../src/lib/backup';

// Только вымышленные данные
let db: DiaryDB;
let n = 0;
const at = (iso: string) => new Date(iso).getTime();

beforeEach(async () => {
  db = new DiaryDB(`backup-${++n}`);
  await db.open();
});
afterEach(async () => {
  await db.delete();
});

async function fill() {
  await updateSettings(db, { dayStartsAt: '05:00' });
  const food = await addItem(db, { kind: 'food', name: 'Тестовая каша', tags: ['глютен'], favorite: true });
  const med = await addItem(db, { kind: 'med', name: 'Препарат-Тест' });
  const [sym] = await listItems(db, { kind: 'symptom' });
  await addEvent(db, { itemId: food.id, ts: at('2026-11-01T08:00:00'), note: 'вымысел' });
  await addEvent(db, { itemId: med.id, ts: at('2026-11-01T09:00:00'), amountText: '1 шт.' });
  await addEvent(db, { itemId: sym!.id, ts: at('2026-11-02T02:00:00'), intensity: 4 });
  await saveDay(db, '2026-11-01', {
    completed: true, flow: 2, note: 'день',
    sleep: { bedtime: '23:30', wake: '07:15', durationMin: 465, quality: 4, awakenings: 1 },
    wellbeing: { mood: 3, energy: 2, stress: 4 },
  });
  const c = await startCourse(db, med.id, '2026-09-01');
  await endCourse(db, c.id, '2026-10-20');
  const m = await addMetric(db, { name: 'Показатель-Т', unit: 'ед', refLow: 0.4, refHigh: 4 });
  await addMeasurement(db, { metricId: m.id, date: '2026-10-01', value: 2.5, note: 'вымысел' });
}

// Сравнение без учёта порядка строк и времени экспорта
const norm = (b: BackupFile) => ({
  settings: b.settings,
  items: [...b.items].sort((x, y) => x.id.localeCompare(y.id)),
  days: [...b.days].sort((x, y) => x.date.localeCompare(y.date)),
  events: [...b.events].sort((x, y) => x.id.localeCompare(y.id)),
  courses: b.courses,
  metrics: b.metrics,
  measurements: b.measurements,
});

describe('резервная копия', () => {
  it('экспорт → удалить всё → импорт восстанавливает данные идентично', async () => {
    await fill();
    const before = await createBackup(db);
    const json = JSON.stringify(before); // как в файле

    await db.delete();
    db = new DiaryDB(`backup-${++n}`);
    await db.open(); // новая база со стартовым справочником

    const parsed = validateBackup(JSON.parse(json));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    await importBackup(db, parsed.data, 'replace');
    const after = await createBackup(db);
    // Единственное ожидаемое отличие: дата последней копии = дата файла
    expect(after.settings.lastExportAt).toBe(before.exportedAt);
    expect(norm(after)).toEqual(norm({ ...before, settings: { ...before.settings, lastExportAt: before.exportedAt } }));
  });

  it('«добавить недостающее» не создаёт дублей и не меняет существующее', async () => {
    await fill();
    const backup = await createBackup(db);
    const stats1 = await importBackup(db, backup, 'merge');
    expect(stats1).toEqual({ items: 0, days: 0, events: 0, courses: 0, measurements: 0 });

    // Удалим одну запись и один день — импорт вернёт только их
    const ev = backup.events[0]!;
    await db.events.delete(ev.id);
    await db.days.delete('2026-11-01');
    await saveDay(db, '2026-11-05', { completed: true });
    const stats2 = await importBackup(db, backup, 'merge');
    expect(stats2).toEqual({ items: 0, days: 1, events: 1, courses: 0, measurements: 0 });
    expect(await db.days.get('2026-11-05')).toBeDefined();
    expect(await db.events.count()).toBe(backup.events.length);
  });

  it('проверка отклоняет чужие, новые и повреждённые файлы', async () => {
    await fill();
    const ok = await createBackup(db);
    const bad = (patch: object) => validateBackup({ ...JSON.parse(JSON.stringify(ok)), ...patch });

    expect(validateBackup({ hello: 1 }).ok).toBe(false);
    expect(validateBackup(null).ok).toBe(false);
    const newer = bad({ dataVersion: 999 });
    expect(newer.ok === false && newer.error).toMatch(/новой версией/);
    expect(bad({ events: [{ ...ok.events[0], itemId: 'нет' }] }).ok).toBe(false);
    expect(bad({ days: [{ ...ok.days[0], date: '2026-02-30' }] }).ok).toBe(false);
    expect(bad({ items: [{ ...ok.items[0], kind: 'pizza' }] }).ok).toBe(false);
    expect(bad({ items: [...ok.items, ok.items[0]] }).ok).toBe(false);
    expect(bad({ days: [{ ...ok.days[0], wellbeing: { mood: 9 } }] }).ok).toBe(false);
    expect(bad({ courses: [{ ...ok.courses[0], itemId: 'нет' }] }).ok).toBe(false);
    expect(bad({ measurements: [{ ...ok.measurements[0], value: 'много' }] }).ok).toBe(false);
  });

  it('файл старого формата 1 (без курсов и показателей) принимается', async () => {
    await fill();
    const b = await createBackup(db);
    const { courses: _c, metrics: _m, measurements: _x, ...v1 } = { ...b, format: 1, dataVersion: 1 };
    const res = validateBackup(JSON.parse(JSON.stringify(v1)));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.courses).toEqual([]);
  });

  it('при ошибке импорта база не меняется', async () => {
    await fill();
    const backup = await createBackup(db);
    const broken = { ...backup, events: [...backup.events, backup.events[0]!] }; // повтор id → ошибка записи
    await expect(importBackup(db, broken, 'replace')).rejects.toThrow();
    expect(await db.events.count()).toBe(backup.events.length);
    expect(await db.items.count()).toBe(backup.items.length);
  });
});

describe('напоминание о копии', () => {
  const day = 86_400_000;
  it('без данных — не напоминать', () => expect(backupOverdue(undefined, false, 7)).toBe(false));
  it('данные есть, копии не было — напоминать', () => expect(backupOverdue(undefined, true, 7)).toBe(true));
  it('копия 3 дня назад — нет, 8 дней назад — да', () => {
    const now = at('2026-11-20T12:00:00');
    expect(backupOverdue(now - 3 * day, true, 7, now)).toBe(false);
    expect(backupOverdue(now - 8 * day, true, 7, now)).toBe(true);
  });
});
