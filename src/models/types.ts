// Модель данных дневника (ТЗ, раздел 5).
// Даты — локальная дата устройства 'YYYY-MM-DD' с учётом границы дня, время — 'HH:MM'.

export type Scale5 = 1 | 2 | 3 | 4 | 5;
export type Flow = 0 | 1 | 2 | 3; // месячные: 0 нет, 1–3 интенсивность

export type Sleep = {
  bedtime?: string; // 'HH:MM'
  wake?: string; // 'HH:MM'
  durationMin?: number; // считается автоматически, можно поправить
  quality?: Scale5;
  awakenings?: number;
  note?: string;
};

/** Стул за день: сколько раз и типичный тип по Бристольской шкале (1–7). count 0 — не было. */
export type Stool = { count: number; type?: 1 | 2 | 3 | 4 | 5 | 6 | 7 };

export type Wellbeing = { mood?: Scale5; energy?: Scale5; stress?: Scale5 };

export type Day = {
  date: string; // 'YYYY-MM-DD', ключ
  completed: boolean; // нажата кнопка «День заполнен»
  sleep?: Sleep; // сон относится к дате пробуждения
  wellbeing?: Wellbeing;
  flow?: Flow;
  stool?: Stool;
  /** Овуляция отмечена вручную в этот день */
  ovulation?: boolean;
  /** Тест на ЛГ (овуляционный): отрицательный / положительный */
  lh?: 'neg' | 'pos';
  note?: string;
  updatedAt: number;
};

export const ITEM_KINDS = ['food', 'drink', 'med', 'supplement', 'symptom', 'activity', 'other'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export type Item = {
  id: string;
  kind: ItemKind;
  name: string;
  tags: string[];
  favorite: boolean;
  /** Входит в «Как обычно»: отмечается одной кнопкой (выбирает сама пользовательница) */
  usual?: boolean;
  archived: boolean;
  useCount: number;
  createdAt: number;
};

// В ТЗ тип называется Event; здесь DiaryEvent, чтобы не путать со встроенным DOM-типом Event.
export type DiaryEvent = {
  id: string;
  date: string; // с учётом границы дня
  ts: number;
  itemId: string;
  kind: ItemKind;
  intensity?: Scale5; // для симптомов
  amountText?: string; // свободный текст, приложение его не разбирает и не оценивает
  note?: string;
};

export type Theme = 'auto' | 'light' | 'dark';

export type Settings = {
  dayStartsAt: string; // 'HH:MM', по умолчанию '04:00'
  symptomMinIntensity: Scale5;
  shortSleepMin: number;
  longSleepMin: number;
  lagDays: number[];
  theme: Theme;
  lastExportAt?: number;
  version: number; // версия схемы данных
  hiddenInsights?: string[]; // id скрытых выводов (ТЗ, 7.10)
  insightNotes?: Record<string, string>; // заметки к выводам
  experiments?: Experiment[]; // «Мои эксперименты»
};

// Курс приёма лекарства/добавки: «принимаю с … », «на паузе с … ». Нужен анализу, чтобы сравнивать периоды.
export type Course = {
  id: string;
  itemId: string;
  start: string; // 'YYYY-MM-DD'
  end?: string; // 'YYYY-MM-DD', последний день приёма; нет — курс идёт
  note?: string;
};

// Показатель (анализ, измерение): ТТГ, ферритин, вес… Норму Настя вводит сама с бланка своей лаборатории.
export type Metric = {
  id: string;
  name: string;
  unit: string;
  refLow?: number;
  refHigh?: number;
  /** Вводить каждый день на экране «Сегодня» (вес, пульс…) */
  daily?: boolean;
  archived: boolean;
  createdAt: number;
};

export type Measurement = {
  id: string;
  metricId: string;
  date: string;
  ts: number;
  value: number;
  note?: string;
};

// Эксперимент: период, который пользовательница задаёт сама (например, «2 недели без молочного»).
// Приложение только сравнивает записи до и во время — без советов, что менять.
export type Experiment = {
  id: string;
  name: string;
  start: string; // 'YYYY-MM-DD'
  end: string; // 'YYYY-MM-DD', последний день (включительно)
  note?: string;
  createdAt: number;
};
