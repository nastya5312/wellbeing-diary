// Демо-данные (ТЗ, 13.3): вымышленный дневник, чтобы посмотреть анализ, не вводя свои записи.
// Живут в отдельной базе DEMO_DB_NAME. Вход и выход перезагружают приложение; при выходе демо-база удаляется.
import Dexie from 'dexie';
import type { Day, DiaryEvent, Item, Measurement, Metric } from '../models/types';
import { DEMO_DB_NAME, DiaryDB, getDb, setDemoFlag } from '../db/schema';
import { rng } from '../analysis/permutation';
import { addDays, tsFromDiaryDate } from './dates';

const DAYS = 120;

const ITEMS: [string, Item['kind'], string, string[]][] = [
  ['d-coffee', 'drink', 'Демо: кофе', []],
  ['d-milk', 'drink', 'Демо: молоко', ['молочное']],
  ['d-cheese', 'food', 'Демо: сыр', ['молочное']],
  ['d-choco', 'food', 'Демо: шоколад', ['сладкое']],
  ['d-cake', 'food', 'Демо: торт', ['сладкое']],
  ['d-oat', 'food', 'Демо: овсянка', []],
  ['d-medA', 'med', 'Демо: лекарство А', []],
  ['d-medB', 'med', 'Демо: лекарство Б', []],
  ['d-supB', 'supplement', 'Демо: добавка', []],
  ['d-head', 'symptom', 'Демо: головная боль', []],
  ['d-bloat', 'symptom', 'Демо: вздутие', []],
  ['d-rash', 'symptom', 'Демо: сыпь', []],
  ['d-heart', 'symptom', 'Демо: изжога', []],
  ['d-walk', 'activity', 'Демо: прогулка', []],
];

/** Сгенерировать вымышленный дневник на DAYS дней до today. Заложенные закономерности перечислены в тексте экрана. */
export function generateDemo(today: string, dayStartsAt: string, seed = 2026) {
  const r = rng(seed);
  const items: Item[] = ITEMS.map(([id, kind, name, tags], i) => ({ id, kind, name, tags, favorite: true, archived: false, useCount: 0, createdAt: i }));
  const days: Day[] = [];
  const events: DiaryEvent[] = [];
  const measurements: Measurement[] = [];
  const metrics: Metric[] = [{ id: 'd-weight', name: 'Вес', unit: 'кг', daily: true, archived: false, createdAt: 0 }];
  let n = 0;
  const ev = (date: string, itemId: string, time: string, extra: Partial<DiaryEvent> = {}) => {
    const kind = items.find((x) => x.id === itemId)!.kind;
    events.push({ id: `d${n++}`, date, itemId, kind, ts: tsFromDiaryDate(date, time, dayStartsAt), ...extra });
  };
  const start = addDays(today, -(DAYS - 1));
  let prevChoco = false;
  let prevFlow = false;
  let weight = 61;
  for (let i = 0; i < DAYS; i++) {
    const date = addDays(start, i);
    const flow = i % 29 < 5;
    const dur = 330 + Math.floor(r() * 210);
    const day: Day = {
      date,
      completed: i < DAYS - 1 && r() > 0.08,
      updatedAt: 0,
      sleep: { bedtime: '23:30', wake: '07:00', durationMin: dur, quality: (1 + Math.floor(r() * 5)) as 1 },
      wellbeing: { mood: (1 + Math.floor(r() * 5)) as 1, energy: (dur < 380 ? 1 + Math.floor(r() * 2) : 2 + Math.floor(r() * 4)) as 1, stress: (1 + Math.floor(r() * 5)) as 1 },
      stool: { count: 1 + Math.floor(r() * 2), type: (3 + Math.floor(r() * 3)) as 3 },
      ...(flow && { flow: 2 as const }),
    };
    days.push(day);
    // Лекарство Б каждое утро; завтрак иногда сразу, иногда через полтора часа
    ev(date, 'd-medB', '07:05');
    const quickBreakfast = r() < 0.4;
    ev(date, 'd-oat', quickBreakfast ? '07:20' : '08:40');
    if (r() < 0.7) ev(date, 'd-coffee', '09:00');
    if (r() < 0.5) ev(date, 'd-supB', '13:00');
    if (r() < 0.4) ev(date, 'd-walk', '18:00');
    const milk = r() < 0.3;
    const cheese = r() < 0.25;
    if (milk) ev(date, 'd-milk', '10:00');
    if (cheese) ev(date, 'd-cheese', '14:00');
    const choco = r() < 0.3;
    if (choco) ev(date, 'd-choco', '16:00');
    if (r() < 0.1) ev(date, 'd-cake', '17:00');
    // Лекарство А — только в дни месячных
    if (flow && r() < 0.8) ev(date, 'd-medA', '12:00');
    // Закономерности: шоколад → сыпь на следующий день; молочное → вздутие в тот же день;
    // после дня месячных → головная боль; завтрак раньше чем через час после лекарства Б → изжога
    if (r() < (prevChoco ? 0.65 : 0.08)) ev(date, 'd-rash', '20:00', { intensity: 2 });
    if (r() < (milk || cheese ? 0.55 : 0.07)) ev(date, 'd-bloat', '19:00', { intensity: 3 });
    if (r() < (prevFlow ? 0.6 : 0.1)) ev(date, 'd-head', '15:00', { intensity: 3 });
    if (r() < (quickBreakfast ? 0.55 : 0.07)) ev(date, 'd-heart', '08:30', { intensity: 2 });
    weight += (r() - 0.5) * 0.3;
    if (r() < 0.8) measurements.push({ id: `dw${i}`, metricId: 'd-weight', date, ts: tsFromDiaryDate(date, '07:00', dayStartsAt), value: Math.round(weight * 10) / 10 });
    prevChoco = choco;
    prevFlow = flow;
  }
  return { items, days, events, metrics, measurements };
}

/** Войти в демо: создать демо-базу с вымышленными данными и перезапустить приложение. */
export async function enterDemo(today: string, dayStartsAt: string): Promise<void> {
  await Dexie.delete(DEMO_DB_NAME);
  const db = new DiaryDB(DEMO_DB_NAME);
  await db.open();
  const d = generateDemo(today, dayStartsAt);
  await db.transaction('rw', [db.items, db.days, db.events, db.metrics, db.measurements], async () => {
    await db.items.clear();
    await db.items.bulkAdd(d.items);
    await db.days.bulkAdd(d.days);
    await db.events.bulkAdd(d.events);
    await db.metrics.bulkAdd(d.metrics);
    await db.measurements.bulkAdd(d.measurements);
  });
  db.close();
  setDemoFlag(true);
  location.reload();
}

/** Выйти из демо: удалить демо-базу и вернуться к своим записям. */
export async function exitDemo(): Promise<void> {
  setDemoFlag(false);
  getDb().close();
  try {
    await Dexie.delete(DEMO_DB_NAME);
  } finally {
    location.reload();
  }
}
