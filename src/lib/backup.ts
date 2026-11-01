// Резервная копия: экспорт всех данных в JSON и восстановление из файла.
import type { DiaryDB } from '../db/schema';
import type { Course, Day, DiaryEvent, Item, Measurement, Metric, Settings } from '../models/types';
import { ITEM_KINDS } from '../models/types';
import { DATA_VERSION, DEFAULT_SETTINGS } from '../db/defaults';
import { getSettings } from '../db/repo';
import { isDateString, isTimeString, localDate } from './dates';
import { APP_VERSION } from './appInfo';
import { shareFile } from './share';

export const BACKUP_APP_ID = 'wellbeing-diary';
export const BACKUP_FORMAT = 2; // 2: добавлены курсы, показатели и значения

export type BackupFile = {
  app: typeof BACKUP_APP_ID;
  format: number;
  dataVersion: number;
  appVersion: string;
  exportedAt: number;
  settings: Settings;
  items: Item[];
  days: Day[];
  events: DiaryEvent[];
  courses: Course[];
  metrics: Metric[];
  measurements: Measurement[];
};

const ALL_TABLES = (db: DiaryDB) => [db.settings, db.items, db.days, db.events, db.courses, db.metrics, db.measurements];

export async function createBackup(db: DiaryDB): Promise<BackupFile> {
  return db.transaction('r', ALL_TABLES(db), async () => ({
    app: BACKUP_APP_ID,
    format: BACKUP_FORMAT,
    dataVersion: DATA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: Date.now(),
    settings: await getSettings(db),
    items: await db.items.toArray(),
    days: await db.days.toArray(),
    events: await db.events.toArray(),
    courses: await db.courses.toArray(),
    metrics: await db.metrics.toArray(),
    measurements: await db.measurements.toArray(),
  }));
}

export function backupFileName(ts = Date.now()): string {
  return `dnevnik-kopiya-${localDate(new Date(ts))}.json`;
}

// ---------- Проверка файла перед восстановлением ----------

type Result = { ok: true; data: BackupFile } | { ok: false; error: string };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isStr = (x: unknown): x is string => typeof x === 'string';
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const optScale = (x: unknown, min = 1, max = 5) => x === undefined || (Number.isInteger(x) && (x as number) >= min && (x as number) <= max);
const optStr = (x: unknown) => x === undefined || isStr(x);

function checkItem(x: unknown): string | null {
  if (!isObj(x)) return 'позиция не объект';
  if (!isStr(x.id) || !x.id) return 'у позиции нет id';
  if (!ITEM_KINDS.includes(x.kind as never)) return `неизвестный тип позиции «${String(x.kind)}»`;
  if (!isStr(x.name) || !x.name.trim()) return 'у позиции нет названия';
  if (!Array.isArray(x.tags) || !x.tags.every(isStr)) return `неверные теги у «${x.name}»`;
  if (typeof x.favorite !== 'boolean' || typeof x.archived !== 'boolean') return `неверные флаги у «${x.name}»`;
  if (x.usual !== undefined && typeof x.usual !== 'boolean') return `неверные флаги у «${x.name}»`;
  if (!isNum(x.useCount) || !isNum(x.createdAt)) return `неверные числа у «${x.name}»`;
  return null;
}

function checkDay(x: unknown): string | null {
  if (!isObj(x)) return 'день не объект';
  if (!isStr(x.date) || !isDateString(x.date)) return `неверная дата дня «${String(x.date)}»`;
  if (typeof x.completed !== 'boolean' || !isNum(x.updatedAt)) return `неверные поля дня ${x.date}`;
  if (x.sleep !== undefined) {
    const s = x.sleep;
    if (!isObj(s)) return `неверный сон ${x.date}`;
    if ((s.bedtime !== undefined && !(isStr(s.bedtime) && isTimeString(s.bedtime))) ||
        (s.wake !== undefined && !(isStr(s.wake) && isTimeString(s.wake))) ||
        (s.durationMin !== undefined && !isNum(s.durationMin)) ||
        (s.awakenings !== undefined && !isNum(s.awakenings)) ||
        !optScale(s.quality) || !optStr(s.note)) return `неверный сон ${x.date}`;
  }
  if (x.wellbeing !== undefined) {
    const w = x.wellbeing;
    if (!isObj(w) || !optScale(w.mood) || !optScale(w.energy) || !optScale(w.stress)) return `неверное самочувствие ${x.date}`;
  }
  if (x.stool !== undefined) {
    const st = x.stool;
    if (!isObj(st) || !isNum(st.count) || st.count < 0 || !Number.isInteger(st.count) || !optScale(st.type, 1, 7)) return `неверный стул ${x.date}`;
  }
  if (!optScale(x.flow, 0, 3) || !optStr(x.note)) return `неверные поля дня ${x.date}`;
  return null;
}

function checkEvent(x: unknown, itemIds: Set<string>): string | null {
  if (!isObj(x)) return 'запись не объект';
  if (!isStr(x.id) || !x.id) return 'у записи нет id';
  if (!isStr(x.date) || !isDateString(x.date)) return `неверная дата записи «${String(x.date)}»`;
  if (!isNum(x.ts)) return 'неверное время записи';
  if (!isStr(x.itemId) || !itemIds.has(x.itemId)) return `запись ${x.date} ссылается на несуществующую позицию`;
  if (!ITEM_KINDS.includes(x.kind as never)) return 'неизвестный тип записи';
  if (!optScale(x.intensity) || !optStr(x.amountText) || !optStr(x.note)) return `неверные поля записи ${x.date}`;
  return null;
}

function checkCourse(x: unknown, itemIds: Set<string>): string | null {
  if (!isObj(x) || !isStr(x.id) || !x.id) return 'курс без id';
  if (!isStr(x.itemId) || !itemIds.has(x.itemId)) return 'курс ссылается на несуществующую позицию';
  if (!isStr(x.start) || !isDateString(x.start)) return 'неверная дата начала курса';
  if (x.end !== undefined && !(isStr(x.end) && isDateString(x.end) && x.end >= x.start)) return 'неверная дата конца курса';
  if (!optStr(x.note)) return 'неверная заметка курса';
  return null;
}

function checkMetric(x: unknown): string | null {
  if (!isObj(x) || !isStr(x.id) || !x.id) return 'показатель без id';
  if (!isStr(x.name) || !x.name.trim() || !isStr(x.unit)) return 'показатель без названия';
  if ((x.refLow !== undefined && !isNum(x.refLow)) || (x.refHigh !== undefined && !isNum(x.refHigh))) return `неверная норма у «${x.name}»`;
  if (typeof x.archived !== 'boolean' || !isNum(x.createdAt)) return `неверные поля у «${x.name}»`;
  if (x.daily !== undefined && typeof x.daily !== 'boolean') return `неверные поля у «${x.name}»`;
  return null;
}

function checkMeasurement(x: unknown, metricIds: Set<string>): string | null {
  if (!isObj(x) || !isStr(x.id) || !x.id) return 'значение без id';
  if (!isStr(x.metricId) || !metricIds.has(x.metricId)) return 'значение ссылается на несуществующий показатель';
  if (!isStr(x.date) || !isDateString(x.date) || !isNum(x.ts) || !isNum(x.value)) return 'неверное значение показателя';
  if (!optStr(x.note)) return 'неверная заметка значения';
  return null;
}

const uniqueIds = (rows: unknown[]) => new Set(rows.map((r) => (r as { id: string }).id)).size === rows.length;

/** Проверка структуры и версии. Ничего не записывает. */
export function validateBackup(raw: unknown): Result {
  if (!isObj(raw) || raw.app !== BACKUP_APP_ID) return { ok: false, error: 'Это не файл резервной копии дневника.' };
  if (!isNum(raw.format) || raw.format > BACKUP_FORMAT || !isNum(raw.dataVersion) || raw.dataVersion > DATA_VERSION) {
    return { ok: false, error: 'Файл создан более новой версией приложения. Сначала обнови приложение.' };
  }
  if (!Array.isArray(raw.items) || !Array.isArray(raw.days) || !Array.isArray(raw.events) || !isObj(raw.settings)) {
    return { ok: false, error: 'Файл повреждён: нет нужных разделов.' };
  }
  const fail = (e: string): Result => ({ ok: false, error: `Файл повреждён: ${e}.` });
  const seen = new Set<string>();
  for (const it of raw.items) {
    const e = checkItem(it);
    if (e) return fail(e);
    const id = (it as Item).id;
    if (seen.has(id)) return fail('повторяющиеся позиции');
    seen.add(id);
  }
  for (const d of raw.days) {
    const e = checkDay(d);
    if (e) return fail(e);
  }
  for (const ev of raw.events) {
    const e = checkEvent(ev, seen);
    if (e) return fail(e);
  }
  // Файлы формата 1 (до курсов и показателей) — пустые разделы
  const courses = Array.isArray(raw.courses) ? raw.courses : [];
  const metrics = Array.isArray(raw.metrics) ? raw.metrics : [];
  const measurements = Array.isArray(raw.measurements) ? raw.measurements : [];
  if (!uniqueIds(raw.events) || !uniqueIds(courses) || !uniqueIds(metrics) || !uniqueIds(measurements)) {
    return fail('повторяющиеся записи');
  }
  if (new Set(raw.days.map((d) => (d as Day).date)).size !== raw.days.length) return fail('повторяющиеся дни');
  for (const c of courses) {
    const e = checkCourse(c, seen);
    if (e) return fail(e);
  }
  const metricIds = new Set<string>();
  for (const m of metrics) {
    const e = checkMetric(m);
    if (e) return fail(e);
    metricIds.add((m as Metric).id);
  }
  for (const m of measurements) {
    const e = checkMeasurement(m, metricIds);
    if (e) return fail(e);
  }
  const s = raw.settings;
  if (s.dayStartsAt !== undefined && !(isStr(s.dayStartsAt) && isTimeString(s.dayStartsAt))) return fail('неверная граница дня');
  if (s.hiddenInsights !== undefined && !(Array.isArray(s.hiddenInsights) && s.hiddenInsights.every(isStr))) return fail('неверный список скрытых выводов');
  if (s.insightNotes !== undefined && !(isObj(s.insightNotes) && Object.values(s.insightNotes).every(isStr))) return fail('неверные заметки к выводам');
  if (
    s.experiments !== undefined &&
    !(Array.isArray(s.experiments) &&
      s.experiments.every((e) => isObj(e) && isStr(e.id) && isStr(e.name) && isStr(e.start) && isDateString(e.start) && isStr(e.end) && isDateString(e.end) && e.end >= e.start && optStr(e.note) && isNum(e.createdAt)))
  ) return fail('неверные эксперименты');
  return {
    ok: true,
    data: {
      ...(raw as unknown as BackupFile),
      courses: courses as Course[],
      metrics: metrics as Metric[],
      measurements: measurements as Measurement[],
      settings: { ...DEFAULT_SETTINGS, ...(s as Partial<Settings>), version: DATA_VERSION },
    },
  };
}

export type ImportMode = 'merge' | 'replace';
export type ImportStats = { items: number; days: number; events: number; courses: number; measurements: number };

/**
 * Восстановление.
 * merge — добавить только то, чего нет (по id и дате); существующее не трогается.
 * replace — стереть всё и записать содержимое файла.
 * Всё в одной транзакции: при ошибке база остаётся как была.
 */
export async function importBackup(db: DiaryDB, data: BackupFile, mode: ImportMode): Promise<ImportStats> {
  return db.transaction('rw', ALL_TABLES(db), async () => {
    if (mode === 'replace') {
      await Promise.all(ALL_TABLES(db).map((t) => t.clear()));
      // Файл, из которого восстановили, — это существующая копия: её дата считается последней копией
      const lastExportAt = Math.max(data.settings.lastExportAt ?? 0, data.exportedAt);
      await db.settings.put({ key: 'app', ...data.settings, lastExportAt });
      await db.items.bulkAdd(data.items);
      await db.days.bulkAdd(data.days);
      await db.events.bulkAdd(data.events);
      await db.courses.bulkAdd(data.courses);
      await db.metrics.bulkAdd(data.metrics);
      await db.measurements.bulkAdd(data.measurements);
      return {
        items: data.items.length, days: data.days.length, events: data.events.length,
        courses: data.courses.length, measurements: data.measurements.length,
      };
    }
    const missing = async <T, K extends string>(table: { bulkGet(keys: K[]): Promise<(T | undefined)[]> }, rows: T[], key: (r: T) => K) => {
      const existing = await table.bulkGet(rows.map(key));
      return rows.filter((_, i) => existing[i] === undefined);
    };
    const items = await missing(db.items, data.items, (r) => r.id);
    const days = await missing(db.days, data.days, (r) => r.date);
    const events = await missing(db.events, data.events, (r) => r.id);
    const courses = await missing(db.courses, data.courses, (r) => r.id);
    const metrics = await missing(db.metrics, data.metrics, (r) => r.id);
    const measurements = await missing(db.measurements, data.measurements, (r) => r.id);
    await db.items.bulkAdd(items);
    await db.days.bulkAdd(days);
    await db.events.bulkAdd(events);
    await db.courses.bulkAdd(courses);
    await db.metrics.bulkAdd(metrics);
    await db.measurements.bulkAdd(measurements);
    const current = await db.settings.get('app');
    if (current) {
      // Эксперименты из файла, которых ещё нет
      const have = new Set((current.experiments ?? []).map((e) => e.id));
      const extra = (data.settings.experiments ?? []).filter((e) => !have.has(e.id));
      const next = { ...current };
      if (extra.length) next.experiments = [...(current.experiments ?? []), ...extra];
      if ((current.lastExportAt ?? 0) < data.exportedAt) next.lastExportAt = data.exportedAt;
      if (extra.length || next.lastExportAt !== current.lastExportAt) await db.settings.put(next);
    }
    return { items: items.length, days: days.length, events: events.length, courses: courses.length, measurements: measurements.length };
  });
}

/** Чтение и разбор файла, выбранного пользовательницей. */
export async function readBackupFile(file: File): Promise<Result> {
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    return { ok: false, error: 'Не удалось прочитать файл. Нужен файл .json, сохранённый из дневника.' };
  }
  return validateBackup(raw);
}

/**
 * Отдать файл копии: системное меню «Поделиться» (там «Сохранить в Файлы»),
 * если не поддерживается — обычное скачивание. Возвращает false, если пользовательница отменила.
 */
export async function shareBackup(data: BackupFile, how: 'share' | 'download' = 'share'): Promise<boolean> {
  return shareFile(new Blob([JSON.stringify(data)], { type: 'application/json' }), backupFileName(data.exportedAt), how);
}

/** Нужно ли напоминание о копии. */
export function backupOverdue(lastExportAt: number | undefined, hasData: boolean, remindDays: number, now = Date.now()): boolean {
  if (!hasData) return false;
  if (lastExportAt === undefined) return true;
  return now - lastExportAt > remindDays * 86_400_000;
}
