// Репозитории: все операции чтения и записи данных дневника.
// Функции принимают базу первым аргументом — так их можно тестировать на отдельной базе (и для демо-данных).
import type { DiaryDB } from './schema';
import type { Day, DiaryEvent, Item, ItemKind, Settings } from '../models/types';
import { DEFAULT_SETTINGS } from './defaults';
import { diaryDate, isDateString, isTimeString } from '../lib/dates';

// ---------- Настройки ----------

export async function getSettings(db: DiaryDB): Promise<Settings> {
  const row = await db.settings.get('app');
  if (!row) return { ...DEFAULT_SETTINGS };
  const { key: _key, ...stored } = row;
  // Значения по умолчанию подставляются для полей, появившихся в новых версиях приложения
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function updateSettings(db: DiaryDB, patch: Partial<Settings>): Promise<Settings> {
  if (patch.dayStartsAt !== undefined && !isTimeString(patch.dayStartsAt)) {
    throw new Error('Граница дня должна быть в формате ЧЧ:ММ');
  }
  if (patch.lagDays !== undefined && patch.lagDays.some((l) => !Number.isInteger(l) || l < 0 || l > 7)) {
    throw new Error('Лаги — целые числа от 0 до 7');
  }
  const next = { ...(await getSettings(db)), ...patch };
  await db.settings.put({ key: 'app', ...next });
  return next;
}

// ---------- Дни ----------

export async function getDay(db: DiaryDB, date: string): Promise<Day | undefined> {
  return db.days.get(date);
}

/** Частичное обновление дня. Если дня нет — создаётся. Вложенные объекты (sleep, wellbeing) сливаются. */
export async function saveDay(db: DiaryDB, date: string, patch: Partial<Omit<Day, 'date' | 'updatedAt'>>): Promise<Day> {
  if (!isDateString(date)) throw new Error(`Неверная дата: ${date}`);
  return db.transaction('rw', db.days, async () => {
    const prev = await db.days.get(date);
    const next: Day = {
      ...prev,
      ...patch,
      date,
      completed: patch.completed ?? prev?.completed ?? false,
      sleep: patch.sleep !== undefined ? { ...prev?.sleep, ...patch.sleep } : prev?.sleep,
      wellbeing: patch.wellbeing !== undefined ? { ...prev?.wellbeing, ...patch.wellbeing } : prev?.wellbeing,
      updatedAt: Date.now(),
    };
    await db.days.put(next);
    return next;
  });
}

/** Дни в диапазоне [from, to] включительно, по возрастанию даты. */
export async function listDays(db: DiaryDB, from: string, to: string): Promise<Day[]> {
  return db.days.where('date').between(from, to, true, true).toArray();
}

// ---------- Справочник ----------

export type NewItem = { kind: ItemKind; name: string; tags?: string[]; favorite?: boolean };

export async function addItem(db: DiaryDB, input: NewItem): Promise<Item> {
  const name = input.name.trim();
  if (!name) throw new Error('Название не может быть пустым');
  const item: Item = {
    id: crypto.randomUUID(),
    kind: input.kind,
    name,
    tags: normalizeTags(input.tags ?? []),
    favorite: input.favorite ?? false,
    archived: false,
    useCount: 0,
    createdAt: Date.now(),
  };
  await db.items.add(item);
  return item;
}

export async function updateItem(db: DiaryDB, id: string, patch: Partial<Omit<Item, 'id' | 'createdAt'>>): Promise<void> {
  const clean = { ...patch };
  if (clean.name !== undefined) {
    clean.name = clean.name.trim();
    if (!clean.name) throw new Error('Название не может быть пустым');
  }
  if (clean.tags) clean.tags = normalizeTags(clean.tags);
  const n = await db.items.update(id, clean);
  if (n === 0) throw new Error('Позиция не найдена');
}

/** Позиции справочника. По умолчанию без архивных. */
export async function listItems(db: DiaryDB, opts: { kind?: ItemKind; includeArchived?: boolean } = {}): Promise<Item[]> {
  const all = opts.kind ? await db.items.where('kind').equals(opts.kind).toArray() : await db.items.toArray();
  return all.filter((it) => opts.includeArchived || !it.archived).sort((a, b) => a.createdAt - b.createdAt);
}

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))];
}

// ---------- События ----------

export type NewEvent = {
  itemId: string;
  ts: number;
  /** Явная дата (если выбрана вручную). Иначе считается из ts и границы дня. */
  date?: string;
  intensity?: DiaryEvent['intensity'];
  amountText?: string;
  note?: string;
};

export async function addEvent(db: DiaryDB, input: NewEvent): Promise<DiaryEvent> {
  if (input.date !== undefined && !isDateString(input.date)) throw new Error(`Неверная дата: ${input.date}`);
  const settings = await getSettings(db);
  return db.transaction('rw', db.items, db.events, async () => {
    const item = await db.items.get(input.itemId);
    if (!item) throw new Error('Позиция справочника не найдена');
    const ev: DiaryEvent = {
      id: crypto.randomUUID(),
      date: input.date ?? diaryDate(input.ts, settings.dayStartsAt),
      ts: input.ts,
      itemId: item.id,
      kind: item.kind,
      ...(input.intensity !== undefined && { intensity: input.intensity }),
      ...(input.amountText?.trim() && { amountText: input.amountText.trim() }),
      ...(input.note?.trim() && { note: input.note.trim() }),
    };
    await db.events.add(ev);
    await db.items.update(item.id, { useCount: item.useCount + 1 });
    return ev;
  });
}

export async function updateEvent(
  db: DiaryDB,
  id: string,
  patch: Partial<Pick<DiaryEvent, 'ts' | 'date' | 'intensity' | 'amountText' | 'note'>>,
): Promise<void> {
  if (patch.date !== undefined && !isDateString(patch.date)) throw new Error(`Неверная дата: ${patch.date}`);
  const n = await db.events.update(id, patch);
  if (n === 0) throw new Error('Запись не найдена');
}

export async function deleteEvent(db: DiaryDB, id: string): Promise<void> {
  await db.events.delete(id);
}

/** События одного дня по времени. */
export async function listEventsByDate(db: DiaryDB, date: string): Promise<DiaryEvent[]> {
  return db.events.where('[date+ts]').between([date, -Infinity], [date, Infinity]).toArray();
}

/** События в диапазоне дат [from, to] включительно. */
export async function listEventsRange(db: DiaryDB, from: string, to: string): Promise<DiaryEvent[]> {
  return db.events.where('date').between(from, to, true, true).sortBy('ts');
}
