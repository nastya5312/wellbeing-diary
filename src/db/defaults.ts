import type { ItemKind, Settings } from '../models/types';

// Текущая версия схемы данных. Увеличивать вместе с новой версией в schema.ts.
export const DATA_VERSION = 3;

export const DEFAULT_SETTINGS: Settings = {
  dayStartsAt: '04:00',
  symptomMinIntensity: 1,
  shortSleepMin: 360, // 6 ч
  longSleepMin: 540, // 9 ч
  lagDays: [0, 1, 2],
  theme: 'auto',
  version: DATA_VERSION,
};

// Стартовый справочник (ТЗ, раздел 5). Лекарств и добавок нет — их Настя добавляет сама.
export const STARTER_ITEMS: { kind: ItemKind; name: string }[] = [
  ...['прыщи', 'головная боль', 'боль внизу живота', 'тошнота', 'вздутие живота', 'усталость', 'отёки', 'изжога'].map(
    (name) => ({ kind: 'symptom' as const, name }),
  ),
  ...['кофе', 'чай', 'алкоголь', 'вода'].map((name) => ({ kind: 'drink' as const, name })),
];

// Подсказки тегов еды при создании позиции.
export const FOOD_TAG_SUGGESTIONS = [
  'молочное', 'сахар', 'глютен', 'острое', 'жареное', 'алкоголь', 'кофе', 'шоколад', 'орехи', 'фастфуд',
];

// Через сколько дней без резервной копии показывать напоминание
export const BACKUP_REMIND_DAYS = 7;

// Подсказки названий показателей (общие, без личных значений). Норму вводит пользовательница.
/** Ежедневные измерения для экрана «Сегодня». Нормы не задаются: их вводит сама пользовательница. */
export const DAILY_METRIC_SUGGESTIONS: { name: string; unit: string }[] = [
  { name: 'Вес', unit: 'кг' },
  { name: 'Пульс утром', unit: 'уд/мин' },
  { name: 'Давление верхнее', unit: 'мм рт. ст.' },
  { name: 'Давление нижнее', unit: 'мм рт. ст.' },
  { name: 'Температура утром', unit: '°C' },
  { name: 'Шаги', unit: 'шагов' },
  { name: 'Вода', unit: 'стаканов' },
  { name: 'Талия', unit: 'см' },
];

export const METRIC_SUGGESTIONS: { name: string; unit: string }[] = [
  { name: 'ТТГ', unit: 'мМЕ/л' },
  { name: 'Т4 свободный', unit: 'пмоль/л' },
  { name: 'Ферритин', unit: 'нг/мл' },
  { name: 'Гемоглобин', unit: 'г/л' },
  { name: 'Витамин D (25-OH)', unit: 'нг/мл' },
  { name: 'Холестерин общий', unit: 'ммоль/л' },
  { name: 'ЛПНП', unit: 'ммоль/л' },
  { name: 'Вес', unit: 'кг' },
  { name: 'Давление верхнее', unit: 'мм рт. ст.' },
  { name: 'Давление нижнее', unit: 'мм рт. ст.' },
  { name: 'Температура', unit: '°C' },
];
