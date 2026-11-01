// Экспорт в CSV по таблицам (ТЗ, 6.10) — для Excel и Numbers. Разделитель «;», дробная часть через запятую,
// кодировка UTF-8 с BOM (иначе Excel показывает кириллицу кракозябрами).
import type { BackupFile } from './backup';
import { KIND_LABEL } from './labels';
import { localTime } from './dates';

const SEP = ';';

/** Ячейка: экранирование кавычек и защита от формул (текст, начинающийся с = + - @, Excel выполнил бы). */
export function cell(v: string | number | boolean | undefined | null): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'boolean') return v ? 'да' : 'нет';
  if (typeof v === 'number') return String(v).replace('.', ',');
  let s = v;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const table = (head: string[], rows: (string | number | boolean | undefined | null)[][]) =>
  '﻿' + [head, ...rows].map((r) => r.map(cell).join(SEP)).join('\r\n') + '\r\n';

export function buildCsvFiles(b: BackupFile): { name: string; text: string }[] {
  const itemBy = new Map(b.items.map((it) => [it.id, it]));
  const metricBy = new Map(b.metrics.map((m) => [m.id, m]));
  const events = [...b.events].sort((x, y) => x.ts - y.ts);
  const days = [...b.days].sort((x, y) => x.date.localeCompare(y.date));
  return [
    {
      name: 'zapisi.csv',
      text: table(
        ['Дата', 'Время', 'Тип', 'Название', 'Сила (1–5)', 'Количество', 'Заметка'],
        events.map((e) => [e.date, localTime(e.ts), KIND_LABEL[e.kind], itemBy.get(e.itemId)?.name ?? 'удалённая позиция', e.intensity, e.amountText, e.note]),
      ),
    },
    {
      name: 'dni.csv',
      text: table(
        ['Дата', 'День заполнен', 'Лёг', 'Встал', 'Сон, мин', 'Качество сна (1–5)', 'Пробуждений', 'Настроение (1–5)', 'Энергия (1–5)', 'Стресс (1–5)', 'Месячные (0–3)', 'Стул, раз', 'Стул, тип (1–7)', 'Заметка'],
        days.map((d) => [
          d.date, d.completed, d.sleep?.bedtime, d.sleep?.wake, d.sleep?.durationMin, d.sleep?.quality, d.sleep?.awakenings,
          d.wellbeing?.mood, d.wellbeing?.energy, d.wellbeing?.stress, d.flow, d.stool?.count, d.stool?.type, d.note,
        ]),
      ),
    },
    {
      name: 'pokazateli.csv',
      text: table(
        ['Дата', 'Показатель', 'Значение', 'Единица', 'Норма от', 'Норма до', 'Заметка'],
        [...b.measurements]
          .sort((x, y) => x.date.localeCompare(y.date))
          .map((v) => {
            const m = metricBy.get(v.metricId);
            return [v.date, m?.name, v.value, m?.unit, m?.refLow, m?.refHigh, v.note];
          }),
      ),
    },
    {
      name: 'kursy.csv',
      text: table(
        ['Название', 'Начало', 'Последний день', 'Заметка'],
        b.courses.map((c) => [itemBy.get(c.itemId)?.name, c.start, c.end ?? 'идёт', c.note]),
      ),
    },
    {
      name: 'spravochnik.csv',
      text: table(
        ['Тип', 'Название', 'Теги', 'В чек-листе', 'В архиве'],
        b.items.map((it) => [KIND_LABEL[it.kind], it.name, it.tags.join(', '), it.favorite, it.archived]),
      ),
    },
  ];
}
