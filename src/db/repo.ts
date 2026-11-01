// Репозитории: все операции чтения и записи данных дневника.
// Функции принимают базу первым аргументом — так их можно тестировать на отдельной базе (и для демо-данных).
import type { DiaryDB } from './schema';
import type { Day, DiaryEvent, Item, ItemKind, Settings } from '../models/types';
import { DEFAULT_SETTINGS } from './defaults';
import { addDays, diaryDate, isDateString, isTimeString } from '../lib/dates';
import { isSimilarName, normalizeName } from '../lib/similar';

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

/** Похожие позиции того же типа (включая архивные) — подсказка против дублей. */
export async function findSimilarItems(db: DiaryDB, kind: ItemKind, name: string): Promise<Item[]> {
  if (!name.trim()) return [];
  const all = await db.items.where('kind').equals(kind).toArray();
  return all.filter((it) => isSimilarName(it.name, name));
}

/** Сколько событий у позиции. */
export async function countItemEvents(db: DiaryDB, itemId: string): Promise<number> {
  return db.events.where('itemId').equals(itemId).count();
}

/** Удаление позиции. Разрешено только без событий — иначе архив или объединение. */
export async function deleteItem(db: DiaryDB, id: string): Promise<void> {
  await db.transaction('rw', db.items, db.events, async () => {
    if ((await db.events.where('itemId').equals(id).count()) > 0) {
      throw new Error('У позиции есть записи. Её можно отправить в архив или объединить с другой.');
    }
    await db.items.delete(id);
  });
}

/**
 * Объединение дублей: все события позиции sourceId переносятся на targetId,
 * теги и счётчики складываются, sourceId удаляется. Позиции должны быть одного типа.
 */
export async function mergeItems(db: DiaryDB, sourceId: string, targetId: string): Promise<void> {
  if (sourceId === targetId) throw new Error('Нельзя объединить позицию саму с собой');
  await db.transaction('rw', db.items, db.events, async () => {
    const [src, dst] = await Promise.all([db.items.get(sourceId), db.items.get(targetId)]);
    if (!src || !dst) throw new Error('Позиция не найдена');
    if (src.kind !== dst.kind) throw new Error('Объединять можно только позиции одного типа');
    await db.events.where('itemId').equals(sourceId).modify({ itemId: targetId });
    await db.items.update(targetId, {
      tags: normalizeTags([...dst.tags, ...src.tags]),
      useCount: dst.useCount + src.useCount,
      favorite: dst.favorite || src.favorite,
      archived: dst.archived && src.archived,
    });
    await db.items.delete(sourceId);
  });
}

/** Недавно использованные позиции типа kind (по последним событиям), без архивных. */
export async function listRecentItems(db: DiaryDB, kind: ItemKind, limit = 8): Promise<Item[]> {
  const ids: string[] = [];
  await db.events
    .orderBy('ts')
    .reverse()
    .until(() => ids.length >= limit)
    .each((e) => {
      if (e.kind === kind && !ids.includes(e.itemId)) ids.push(e.itemId);
    });
  const items = await db.items.bulkGet(ids);
  return items.filter((it): it is Item => !!it && !it.archived);
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

/** Даты с месячными (flow > 0) в диапазоне — для дня цикла. */
export async function listFlowDates(db: DiaryDB, from: string, to: string): Promise<string[]> {
  return (await listDays(db, from, to)).filter((d) => (d.flow ?? 0) > 0).map((d) => d.date);
}

/** Есть ли записи раньше даты date (чтобы не напоминать «вчера не отмечен» в самый первый день). */
export async function hasDataBefore(db: DiaryDB, date: string): Promise<boolean> {
  const day = await db.days.where('date').below(date).first();
  if (day) return true;
  return (await db.events.where('date').below(date).count()) > 0;
}

/** Вчерашняя дата дневника, если она не отмечена как заполненная и пользование уже началось. */
export async function unfinishedYesterday(db: DiaryDB, today: string): Promise<string | null> {
  const y = addDays(today, -1);
  const day = await db.days.get(y);
  if (day?.completed) return null;
  return (await hasDataBefore(db, today)) ? y : null;
}

/** События в диапазоне дат [from, to] включительно. */
export async function listEventsRange(db: DiaryDB, from: string, to: string): Promise<DiaryEvent[]> {
  return db.events.where('date').between(from, to, true, true).sortBy('ts');
}

/** Есть ли хоть какие-то записи (для напоминания о копии). */
export async function hasAnyData(db: DiaryDB): Promise<boolean> {
  return (await db.events.count()) > 0 || (await db.days.count()) > 0;
}

/**
 * Добавить позиции из вставленного списка. Если такая позиция уже есть (то же название и тип),
 * новая не создаётся: теги дописываются, при favorite — позиция становится избранной и возвращается из архива.
 */
export async function importListEntries(
  db: DiaryDB,
  entries: { kind: ItemKind; name: string; tags: string[] }[],
  favorite: boolean,
): Promise<{ added: number; updated: number }> {
  return db.transaction('rw', db.items, async () => {
    const all = await db.items.toArray();
    const byKey = new Map(all.map((it) => [`${it.kind}:${normalizeName(it.name)}`, it]));
    let added = 0;
    let updated = 0;
    const now = Date.now();
    for (const [i, e] of entries.entries()) {
      const name = e.name.trim();
      if (!name) continue;
      const key = `${e.kind}:${normalizeName(name)}`;
      const existing = byKey.get(key);
      if (existing) {
        await db.items.update(existing.id, {
          tags: normalizeTags([...existing.tags, ...e.tags]),
          ...(favorite && { favorite: true, archived: false }),
        });
        updated++;
      } else {
        const item: Item = {
          id: crypto.randomUUID(),
          kind: e.kind,
          name,
          tags: normalizeTags(e.tags),
          favorite,
          archived: false,
          useCount: 0,
          createdAt: now + i, // порядок как в списке
        };
        await db.items.add(item);
        byKey.set(key, item);
        added++;
      }
    }
    return { added, updated };
  });
}
