import { useState } from 'preact/hooks';
import type { Course, DiaryEvent, Item, ItemKind, Scale5 } from '../models/types';
import { getDb } from '../db/schema';
import { addEvent, deleteEvent, updateEvent } from '../db/repo';
import { courseStatus } from '../db/courses';
import { safe, notify } from '../lib/notify';
import { INTENSITY_LABELS, KIND_PLURAL } from '../lib/labels';
import { Sheet } from './Sheet';
import { ItemCreator } from '../screens/Catalog';

const ORDER: ItemKind[] = ['med', 'supplement', 'symptom', 'food', 'drink', 'activity', 'other'];
// Группы, где уместна кнопка «Всё как обычно» (ежедневный приём)
const ROUTINE: ItemKind[] = ['med', 'supplement'];
const COLLAPSED_KEY = 'checklist-collapsed';

// Какие группы свёрнуты — удобство одного телефона, хранится в localStorage (не данные дневника)
function loadCollapsed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}
function saveCollapsed(s: Set<string>) {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...s]));
  } catch {
    /* хранилище недоступно — просто не запоминаем */
  }
}

type Props = {
  /** Дата дневника, за которую отмечаем */
  date: string;
  /** Время новой отметки: сейчас для сегодняшнего дня, полдень для прошлых */
  tsFor: () => number;
  items: Item[];
  events: DiaryEvent[];
  courses: Course[];
  onEmptyHint: () => void;
};

// Чек-лист избранного.
// Касание неотмеченной позиции — отметить (симптом: затем спросить силу). Касание отмеченной — снять.
// «+1» у отмеченной — ещё одна запись (вторая чашка кофе). Всё отменяется кнопкой в уведомлении.
export function Checklist({ date, tsFor, items, events, courses, onEmptyHint }: Props) {
  const db = getDb();
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const [askIntensity, setAskIntensity] = useState<{ ev: DiaryEvent; name: string } | null>(null);
  const [creating, setCreating] = useState<ItemKind | null>(null);

  const toggleGroup = (kind: string) => {
    const next = new Set(collapsed);
    if (next.has(kind)) next.delete(kind);
    else next.add(kind);
    setCollapsed(next);
    saveCollapsed(next);
  };

  const favorites = items.filter((it) => it.favorite && !it.archived);
  const todayEvents = new Map<string, DiaryEvent[]>();
  for (const e of events) todayEvents.set(e.itemId, [...(todayEvents.get(e.itemId) ?? []), e]);
  const coursesBy = new Map<string, Course[]>();
  for (const c of courses) coursesBy.set(c.itemId, [...(coursesBy.get(c.itemId) ?? []), c]);
  const isPaused = (it: Item) => courseStatus(coursesBy.get(it.id) ?? [], date) === 'paused';

  const add = async (it: Item) => {
    const ev = await safe(() => addEvent(db, { itemId: it.id, ts: tsFor(), date }));
    if (!ev) return;
    if (it.kind === 'symptom') {
      setAskIntensity({ ev, name: it.name });
      return;
    }
    notify(`Отмечено: ${it.name}`, 'info', { label: 'Отменить', run: () => void safe(() => deleteEvent(db, ev.id)) });
  };

  const unmark = async (it: Item) => {
    const list = todayEvents.get(it.id) ?? [];
    const last = list.reduce<DiaryEvent | undefined>((a, b) => (!a || b.ts > a.ts ? b : a), undefined);
    if (!last) return;
    const ok = await safe(async () => (await deleteEvent(db, last.id), true));
    if (ok) {
      notify(`Снято: ${it.name}`, 'info', { label: 'Вернуть', run: () => void safe(() => db.events.add(last)) });
    }
  };

  const markRoutine = async (group: Item[]) => {
    const todo = group.filter((it) => !todayEvents.has(it.id) && !isPaused(it));
    if (!todo.length) {
      notify('Всё уже отмечено');
      return;
    }
    const now = tsFor();
    const created = await safe(async () => {
      const out: DiaryEvent[] = [];
      for (const it of todo) out.push(await addEvent(db, { itemId: it.id, ts: now, date }));
      return out;
    });
    if (created) {
      notify(`Отмечено: ${created.length}`, 'info', {
        label: 'Отменить',
        run: () => void safe(() => db.events.bulkDelete(created.map((e) => e.id))),
      });
    }
  };

  if (favorites.length === 0) {
    return (
      <button type="button" class="banner banner-info" onClick={onEmptyHint}>
        Здесь будет чек-лист для отметок одним касанием. Отметь позиции звёздочкой ★ или{' '}
        <u>вставь свой список в справочник</u>.
      </button>
    );
  }

  return (
    <section class="checklist" aria-label="Чек-лист">
      {ORDER.map((kind) => {
        const group = favorites.filter((it) => it.kind === kind).sort((a, b) => a.createdAt - b.createdAt);
        if (!group.length) return null;
        const isOpen = !collapsed.has(kind);
        const marked = group.filter((it) => todayEvents.has(it.id)).length;
        const active = group.filter((it) => !isPaused(it));
        return (
          <div key={kind} class="check-group">
            <div class="group-head">
              <h3>
                <button type="button" class="group-toggle" aria-expanded={isOpen} onClick={() => toggleGroup(kind)}>
                  <span aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
                  {KIND_PLURAL[kind]}
                  <span class="muted">
                    {' '}
                    · {marked} из {group.length}
                  </span>
                </button>
              </h3>
              {isOpen && ROUTINE.includes(kind) && active.length > 1 && (
                <button type="button" class="btn btn-small" onClick={() => void markRoutine(group)}>
                  Всё как обычно
                </button>
              )}
              {isOpen && (
                <button type="button" class="icon-btn icon-small" aria-label={`Добавить: ${KIND_PLURAL[kind]}`} onClick={() => setCreating(kind)}>
                  +
                </button>
              )}
            </div>
            {isOpen && (
              <div class="chips">
                {group.map((it) => {
                  const list = todayEvents.get(it.id) ?? [];
                  const n = list.length;
                  const paused = isPaused(it);
                  const maxIntensity = Math.max(0, ...list.map((e) => e.intensity ?? 0));
                  return (
                    <span key={it.id} class="chip-wrap">
                      <button
                        type="button"
                        class={`chip chip-check${n ? ' done' : ''}${paused ? ' paused' : ''}`}
                        aria-pressed={n > 0}
                        aria-label={`${it.name}${paused ? ', на паузе' : ''}${n ? `, отмечено ${n} раз. Нажми, чтобы снять` : '. Нажми, чтобы отметить'}`}
                        onClick={() => void (n ? unmark(it) : add(it))}
                      >
                        <span class="chip-mark" aria-hidden="true">
                          {n ? '✓' : ''}
                        </span>
                        <span>
                          {it.name}
                          {paused && <span class="muted small"> · пауза</span>}
                          {maxIntensity > 0 && <span class="muted small"> · {INTENSITY_LABELS[maxIntensity - 1]}</span>}
                        </span>
                        {n > 1 && <span class="chip-count">×{n}</span>}
                      </button>
                      {n > 0 && !ROUTINE.includes(kind) && (
                        <button type="button" class="chip-plus" aria-label={`Ещё раз: ${it.name}`} onClick={() => void add(it)}>
                          +1
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      <p class="muted small">Касание — отметить, ещё касание — снять. «+1» — ещё раз за день (вторая чашка, повтор симптома).</p>

      {askIntensity && (
        <Sheet title={askIntensity.name} onClose={() => setAskIntensity(null)}>
          <p>Насколько сильно?</p>
          <div class="intensity-list">
            {INTENSITY_LABELS.map((label, i) => (
              <button
                type="button"
                key={i}
                class="btn intensity-btn"
                onClick={() => {
                  const ev = askIntensity.ev;
                  void safe(() => updateEvent(db, ev.id, { intensity: (i + 1) as Scale5 }));
                  setAskIntensity(null);
                  notify(`Отмечено: ${askIntensity.name}, ${label}`, 'info', {
                    label: 'Отменить',
                    run: () => void safe(() => deleteEvent(db, ev.id)),
                  });
                }}
              >
                <strong>{i + 1}</strong> {label}
              </button>
            ))}
          </div>
          <button type="button" class="btn btn-link" onClick={() => setAskIntensity(null)}>
            Пропустить
          </button>
          <button
            type="button"
            class="btn btn-link danger-link"
            onClick={() => {
              void safe(() => deleteEvent(db, askIntensity.ev.id));
              setAskIntensity(null);
              notify('Отметка отменена');
            }}
          >
            Отметила случайно — отменить
          </button>
        </Sheet>
      )}
      {creating && <ItemCreator kind={creating} defaultFavorite onClose={() => setCreating(null)} />}
    </section>
  );
}
