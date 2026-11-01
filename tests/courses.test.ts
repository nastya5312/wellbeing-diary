import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DiaryDB } from '../src/db/schema';
import { addItem } from '../src/db/repo';
import {
  addMeasurement, addMetric, courseStatus, deleteMetric, endCourse, listCourses, listMeasurements,
  parseNumberRu, startCourse, updateMetric, enableDailyMetric, listDailyMetrics, setDailyValue, listMeasurementsByDate,
} from '../src/db/courses';

let db: DiaryDB;
let n = 0;
beforeEach(async () => {
  db = new DiaryDB(`courses-${++n}`);
  await db.open();
});
afterEach(async () => {
  await db.delete();
});

describe('курсы приёма', () => {
  it('начало, пауза, возобновление и статус на дату', async () => {
    const it1 = await addItem(db, { kind: 'supplement', name: 'Добавка-Тест' });
    const c1 = await startCourse(db, it1.id, '2026-09-01');
    await expect(startCourse(db, it1.id, '2026-10-01')).rejects.toThrow(/уже идёт/);
    await endCourse(db, c1.id, '2026-10-29');
    await expect(startCourse(db, it1.id, '2026-10-15')).rejects.toThrow(/пересекается/);
    await startCourse(db, it1.id, '2026-11-10');
    const list = await listCourses(db, it1.id);
    expect(list).toHaveLength(2);
    expect(courseStatus(list, '2026-08-31')).toBe('paused');
    expect(courseStatus(list, '2026-10-29')).toBe('active');
    expect(courseStatus(list, '2026-11-01')).toBe('paused');
    expect(courseStatus(list, '2026-11-10')).toBe('active');
    expect(courseStatus([], '2026-11-10')).toBeNull();
  });
  it('пауза раньше начала — ошибка', async () => {
    const it1 = await addItem(db, { kind: 'med', name: 'Препарат-Тест' });
    const c = await startCourse(db, it1.id, '2026-09-01');
    await expect(endCourse(db, c.id, '2026-08-01')).rejects.toThrow();
  });
});

describe('показатели', () => {
  it('добавление, норма, значения по дате', async () => {
    const m = await addMetric(db, { name: 'Показатель-Т', unit: 'ед', refLow: 1, refHigh: 4 });
    await expect(addMetric(db, { name: 'показатель-т', unit: 'ед' })).rejects.toThrow(/уже есть/);
    await expect(updateMetric(db, m.id, { refLow: 10 })).rejects.toThrow(/больше верхней/);
    await addMeasurement(db, { metricId: m.id, date: '2026-10-01', value: 3.2 });
    await addMeasurement(db, { metricId: m.id, date: '2026-06-01', value: 5.1 });
    expect((await listMeasurements(db, m.id)).map((x) => x.value)).toEqual([5.1, 3.2]);
    await expect(deleteMetric(db, m.id)).rejects.toThrow(/архив/);
  });
  it('числа по-русски', () => {
    expect(parseNumberRu('4,25')).toBe(4.25);
    expect(parseNumberRu(' 120 ')).toBe(120);
    expect(parseNumberRu('4,2,5')).toBeNull();
    expect(parseNumberRu('abc')).toBeNull();
  });
});

describe('ежедневные измерения', () => {
  it('одно значение в день: запись, замена, удаление', async () => {
    const w = await enableDailyMetric(db, 'Вес', 'кг');
    await setDailyValue(db, w.id, '2026-11-01', 60.2);
    await setDailyValue(db, w.id, '2026-11-01', 60.4);
    let list = await listMeasurementsByDate(db, '2026-11-01');
    expect(list).toHaveLength(1);
    expect(list[0]!.value).toBe(60.4);
    await setDailyValue(db, w.id, '2026-11-02', 60.1);
    await setDailyValue(db, w.id, '2026-11-01', null);
    list = await listMeasurementsByDate(db, '2026-11-01');
    expect(list).toHaveLength(0);
    expect(await listMeasurements(db, w.id)).toHaveLength(1);
  });

  it('закрепление находит существующий показатель по названию, снятие не удаляет значения', async () => {
    const m = await addMetric(db, { name: 'вес', unit: 'кг' });
    await addMeasurement(db, { metricId: m.id, date: '2026-10-01', value: 61 });
    const d = await enableDailyMetric(db, 'Вес', 'кг');
    expect(d.id).toBe(m.id);
    expect((await listDailyMetrics(db)).map((x) => x.id)).toEqual([m.id]);
    await updateMetric(db, m.id, { daily: false });
    expect(await listDailyMetrics(db)).toHaveLength(0);
    expect(await listMeasurements(db, m.id)).toHaveLength(1);
  });
});
