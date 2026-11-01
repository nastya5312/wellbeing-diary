import type { ItemKind } from '../models/types';

export const KIND_LABEL: Record<ItemKind, string> = {
  food: 'Еда',
  drink: 'Напиток',
  med: 'Лекарство',
  supplement: 'Добавка',
  symptom: 'Симптом',
  activity: 'Активность',
  other: 'Другое',
};

export const KIND_PLURAL: Record<ItemKind, string> = {
  food: 'Еда',
  drink: 'Напитки',
  med: 'Лекарства',
  supplement: 'Добавки',
  symptom: 'Симптомы',
  activity: 'Активность',
  other: 'Другое',
};

export const MOOD_LABELS = ['очень плохо', 'плохо', 'так себе', 'хорошо', 'отлично'];
export const ENERGY_LABELS = ['нет сил', 'мало', 'средне', 'бодро', 'очень бодро'];
export const STRESS_LABELS = ['спокойно', 'немного', 'средне', 'сильно', 'очень сильно'];
export const QUALITY_LABELS = ['очень плохо', 'плохо', 'средне', 'хорошо', 'отлично'];
export const INTENSITY_LABELS = ['едва заметно', 'слабо', 'средне', 'сильно', 'очень сильно'];
export const FLOW_LABELS = ['нет', 'слабые', 'средние', 'сильные'];

/** Бристольская шкала формы стула — только описание, без оценок. */
export const BRISTOL_LABELS = [
  'отдельные твёрдые комочки',
  'колбаска, комковатая',
  'колбаска с трещинами',
  'гладкая мягкая колбаска',
  'мягкие кусочки с ровными краями',
  'рыхлые кусочки, кашица',
  'жидкий, без твёрдых частиц',
];
