// Курсы приёма и показатели (анализы, измерения).
import type { DiaryDB } from './schema';
import type { Course, Measurement, Metric } from '../models/types';
import { isDateString } from '../lib/dates';

// ---------- Курсы ----------

export async function listCourses(db: DiaryDB, itemId: string): Promise<Course[]> {
  return (await db.courses.where('itemId').equals(itemId).toArray()).sort((a, b) => a.start.localeCompare(b.start));
}

/** Состояние приёма позиции на дату: 'active' — курс идёт, 'paused' — последний курс закончен, null — курсов нет. */
export function courseStatus(courses: Course[], date: string): 'active' | 'paused' | null {
  if (!courses.length) return null;
  const relevant = courses.filter((c) => c.start <= date);
  if (!relevant.length) return 'paused';
  return relevant.some((c) => c.end === undefined || c.end >= date) ? 'active' : 'paused';
}

/** Начать курс с даты. Нельзя, если уже идёт незавершённый курс или даты пересекаются. */
export async function startCourse(db: DiaryDB, itemId: string, start: string, note?: string): Promise<Course> {
  if (!isDateString(start)) throw new Error('Неверная дата начала');
  return db.transaction('rw', db.courses, db.items, async () => {
    if (!(await db.items.get(itemId))) throw new Error('Позиция не найдена');
    const existing = await listCourses(db, itemId);
    if (existing.some((c) => c.end === undefined)) throw new Error('Курс уже идёт. Сначала отметь паузу.');
    if (existing.some((c) => c.end !== undefined && c.end >= start)) {
      throw new Error('Дата начала пересекается с прошлым курсом');
    }
    const course: Course = { id: crypto.randomUUID(), itemId, start, ...(note?.trim() && { note: note.trim() }) };
    await db.courses.add(course);
    return course;
  });
}

/** Поставить на паузу: end — последний день приёма. */
export async function endCourse(db: DiaryDB, courseId: string, end: string): Promise<void> {
  if (!isDateString(end)) throw new Error('Неверная дата');
  await db.transaction('rw', db.courses, async () => {
    const c = await db.courses.get(courseId);
    if (!c) throw new Error('Курс не найден');
    if (end < c.start) throw new Error('Пауза не может быть раньше начала курса');
    await db.courses.update(courseId, { end });
  });
}

export async function deleteCourse(db: DiaryDB, courseId: string): Promise<void> {
  await db.courses.delete(courseId);
}

// ---------- Показатели ----------

export async function addMetric(db: DiaryDB, input: { name: string; unit: string; refLow?: number; refHigh?: number }): Promise<Metric> {
  const name = input.name.trim();
  if (!name) throw new Error('Название не может быть пустым');
  if (input.refLow !== undefined && input.refHigh !== undefined && input.refLow > input.refHigh) {
    throw new Error('Нижняя граница нормы больше верхней');
  }
  const all = await db.metrics.toArray();
  if (all.some((m) => m.name.trim().toLowerCase() === name.toLowerCase())) throw new Error(`Показатель «${name}» уже есть`);
  const m: Metric = {
    id: crypto.randomUUID(),
    name,
    unit: input.unit.trim(),
    ...(input.refLow !== undefined && { refLow: input.refLow }),
    ...(input.refHigh !== undefined && { refHigh: input.refHigh }),
    archived: false,
    createdAt: Date.now(),
  };
  await db.metrics.add(m);
  return m;
}

export async function updateMetric(db: DiaryDB, id: string, patch: Partial<Omit<Metric, 'id' | 'createdAt'>>): Promise<void> {
  if (patch.name !== undefined && !patch.name.trim()) throw new Error('Название не может быть пустым');
  const cur = await db.metrics.get(id);
  if (!cur) throw new Error('Показатель не найден');
  const next = { ...cur, ...patch };
  if (next.refLow !== undefined && next.refHigh !== undefined && next.refLow > next.refHigh) {
    throw new Error('Нижняя граница нормы больше верхней');
  }
  await db.metrics.put(next);
}

export async function listMetrics(db: DiaryDB, includeArchived = false): Promise<Metric[]> {
  return (await db.metrics.toArray()).filter((m) => includeArchived || !m.archived).sort((a, b) => a.createdAt - b.createdAt);
}

/** Удалить показатель можно только без значений. */
export async function deleteMetric(db: DiaryDB, id: string): Promise<void> {
  await db.transaction('rw', db.metrics, db.measurements, async () => {
    if ((await db.measurements.where('metricId').equals(id).count()) > 0) {
      throw new Error('У показателя есть значения. Его можно отправить в архив.');
    }
    await db.metrics.delete(id);
  });
}

export async function addMeasurement(db: DiaryDB, input: { metricId: string; date: string; value: number; note?: string; ts?: number }): Promise<Measurement> {
  if (!isDateString(input.date)) throw new Error('Неверная дата');
  if (!Number.isFinite(input.value)) throw new Error('Значение должно быть числом');
  if (!(await db.metrics.get(input.metricId))) throw new Error('Показатель не найден');
  const m: Measurement = {
    id: crypto.randomUUID(),
    metricId: input.metricId,
    date: input.date,
    ts: input.ts ?? Date.now(),
    value: input.value,
    ...(input.note?.trim() && { note: input.note.trim() }),
  };
  await db.measurements.add(m);
  return m;
}

export async function updateMeasurement(db: DiaryDB, id: string, patch: Partial<Pick<Measurement, 'date' | 'value' | 'note'>>): Promise<void> {
  if (patch.date !== undefined && !isDateString(patch.date)) throw new Error('Неверная дата');
  if (patch.value !== undefined && !Number.isFinite(patch.value)) throw new Error('Значение должно быть числом');
  if ((await db.measurements.update(id, patch)) === 0) throw new Error('Значение не найдено');
}

export async function deleteMeasurement(db: DiaryDB, id: string): Promise<void> {
  await db.measurements.delete(id);
}

/** Значения показателя по дате (старые → новые). */
export async function listMeasurements(db: DiaryDB, metricId: string): Promise<Measurement[]> {
  return db.measurements.where('[metricId+date]').between([metricId, ''], [metricId, '￿']).toArray();
}

/** Разбор числа, введённого по-русски: «4,25» и «4.25». */
export function parseNumberRu(s: string): number | null {
  const t = s.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}
