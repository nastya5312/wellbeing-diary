import type { ItemKind, Settings } from '../models/types';

// Текущая версия схемы данных. Увеличивать вместе с новой версией в schema.ts.
export const DATA_VERSION = 1;

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
  ...['прыщи', 'головная боль', 'боль внизу живота', 'тошнота', 'вздутие', 'усталость', 'отёки', 'изжога'].map(
    (name) => ({ kind: 'symptom' as const, name }),
  ),
  ...['кофе', 'чай', 'алкоголь', 'вода'].map((name) => ({ kind: 'drink' as const, name })),
];

// Подсказки тегов еды при создании позиции.
export const FOOD_TAG_SUGGESTIONS = [
  'молочное', 'сахар', 'глютен', 'острое', 'жареное', 'алкоголь', 'кофе', 'шоколад', 'орехи', 'фастфуд',
];
