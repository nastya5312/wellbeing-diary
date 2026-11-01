import Dexie, { type Table } from 'dexie';
import type { Course, Day, DiaryEvent, Item, Measurement, Metric, Settings } from '../models/types';
import { DEFAULT_SETTINGS, STARTER_ITEMS } from './defaults';

export const DB_NAME = 'wellbeing-diary';

type SettingsRow = Settings & { key: 'app' };

export class DiaryDB extends Dexie {
  days!: Table<Day, string>;
  items!: Table<Item, string>;
  events!: Table<DiaryEvent, string>;
  settings!: Table<SettingsRow, string>;
  courses!: Table<Course, string>;
  metrics!: Table<Metric, string>;
  measurements!: Table<Measurement, string>;

  constructor(name = DB_NAME) {
    super(name);

    // МИГРАЦИИ. Правила, чтобы обновление не стирало данные:
    // 1. Старые версии не удалять и не менять.
    // 2. Новая версия — новый вызов this.version(N).stores({...}) с полной схемой,
    //    при изменении формата данных — .upgrade(tx => ...) с переносом.
    // 3. Поднять DATA_VERSION в defaults.ts и добавить тест на миграцию.
    // В stores указываются только индексируемые поля; остальные поля хранятся как есть.
    this.version(1).stores({
      days: '&date, completed, updatedAt',
      items: '&id, kind, name, favorite, archived',
      events: '&id, date, ts, itemId, kind, [date+ts]',
      settings: '&key',
    });

    // Версия 2 (ноябрь 2026): курсы приёма, показатели и их значения. Старые данные не меняются.
    this.version(2)
      .stores({
        days: '&date, completed, updatedAt',
        items: '&id, kind, name, favorite, archived',
        events: '&id, date, ts, itemId, kind, [date+ts]',
        settings: '&key',
        courses: '&id, itemId, start',
        metrics: '&id, name',
        measurements: '&id, metricId, date, [metricId+date]',
      })
      .upgrade(async (tx) => {
        await tx.table('settings').toCollection().modify((s: { version?: number }) => {
          s.version = 2;
        });
      });

    // Первое создание базы: настройки по умолчанию и стартовый справочник.
    this.on('populate', (tx) => {
      const now = Date.now();
      void tx.table('settings').add({ key: 'app', ...DEFAULT_SETTINGS });
      void tx.table('items').bulkAdd(
        STARTER_ITEMS.map((it, i) => ({
          id: crypto.randomUUID(),
          kind: it.kind,
          name: it.name,
          tags: [],
          favorite: false,
          archived: false,
          useCount: 0,
          createdAt: now + i, // порядок как в списке
        })),
      );
    });
  }
}

let instance: DiaryDB | null = null;

/** Демо-режим: отдельная база с вымышленными данными. Настоящая база в нём не открывается и не меняется. */
export const DEMO_DB_NAME = 'wellbeing-diary-demo';
const DEMO_FLAG = 'demo-mode';

export function isDemo(): boolean {
  try {
    return localStorage.getItem(DEMO_FLAG) === '1';
  } catch {
    return false;
  }
}

export function setDemoFlag(on: boolean): void {
  if (on) localStorage.setItem(DEMO_FLAG, '1');
  else localStorage.removeItem(DEMO_FLAG);
}

/** Общая база приложения (в демо-режиме — демо-база). */
export function getDb(): DiaryDB {
  instance ??= new DiaryDB(isDemo() ? DEMO_DB_NAME : DB_NAME);
  return instance;
}
