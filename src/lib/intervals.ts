// Интервалы после приёма лекарства: через сколько минут была первая еда/напиток (кроме воды) или добавка.
import type { DiaryEvent, Item, ItemKind } from '../models/types';
import { localTime } from './dates';

/** Вода не считается едой/напитком для интервала. */
export function isWater(it: Item | undefined): boolean {
  if (!it) return false;
  const name = it.name.trim().toLowerCase();
  return name === 'вода' || it.tags.some((t) => t.trim().toLowerCase() === 'вода');
}

const FOOD_KINDS: ItemKind[] = ['food', 'drink'];

/** Первое событие нужного вида после времени ts (в пределах переданных событий одного дня). */
export function firstAfter(
  ts: number,
  dayEvents: DiaryEvent[],
  items: Map<string, Item>,
  what: 'food' | 'supplement',
): DiaryEvent | undefined {
  return dayEvents
    .filter((e) => e.ts > ts && (what === 'food' ? FOOD_KINDS.includes(e.kind) && !isWater(items.get(e.itemId)) : e.kind === 'supplement'))
    .sort((a, b) => a.ts - b.ts)[0];
}

export type MedInterval = {
  eventId: string;
  medName: string;
  medTime: string;
  next: { name: string; time: string; minutes: number } | null;
};

/** Для экрана дня: каждый приём лекарства и первая еда/напиток после него. */
export function medIntervals(dayEvents: DiaryEvent[], items: Map<string, Item>): MedInterval[] {
  return dayEvents
    .filter((e) => e.kind === 'med')
    .sort((a, b) => a.ts - b.ts)
    .map((m) => {
      const f = firstAfter(m.ts, dayEvents, items, 'food');
      return {
        eventId: m.id,
        medName: items.get(m.itemId)?.name ?? 'лекарство',
        medTime: localTime(m.ts),
        next: f ? { name: items.get(f.itemId)?.name ?? '', time: localTime(f.ts), minutes: Math.round((f.ts - m.ts) / 60000) } : null,
      };
    });
}
