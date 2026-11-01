import { useState } from 'preact/hooks';
import type { DiaryEvent, Item, ItemKind } from '../models/types';
import { getDb } from '../db/schema';
import { addEvent, deleteEvent } from '../db/repo';
import { safe, notify } from '../lib/notify';
import { KIND_PLURAL } from '../lib/labels';

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

const ORDER: ItemKind[] = ['med', 'supplement', 'symptom', 'food', 'drink', 'activity', 'other'];

// Чек-лист избранного: одно касание — событие с текущим временем. Повторное касание добавляет ещё одно (вторая чашка кофе).
// Отменить — кнопкой в уведомлении или свайпом в списке записей.
export function Checklist({ today, items, events, onEmptyHint }: {
  today: string;
  items: Item[];
  events: DiaryEvent[];
  onEmptyHint: () => void;
}) {
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const toggle = (kind: string) => {
    const next = new Set(collapsed);
    if (next.has(kind)) next.delete(kind);
    else next.add(kind);
    setCollapsed(next);
    saveCollapsed(next);
  };
  const favorites = items.filter((it) => it.favorite && !it.archived);
  const counts = new Map<string, number>();
  for (const e of events) counts.set(e.itemId, (counts.get(e.itemId) ?? 0) + 1);

  if (favorites.length === 0) {
    return (
      <button type="button" class="banner banner-info" onClick={onEmptyHint}>
        Здесь будет чек-лист для отметок одним касанием. Отметь позиции звёздочкой ★ или{' '}
        <u>вставь свой список в справочник</u>.
      </button>
    );
  }

  const mark = async (it: Item) => {
    const ev = await safe(() => addEvent(getDb(), { itemId: it.id, ts: Date.now(), date: today }));
    if (ev) {
      notify(`Отмечено: ${it.name}`, 'info', {
        label: 'Отменить',
        run: () => void safe(() => deleteEvent(getDb(), ev.id)),
      });
    }
  };

  return (
    <section class="checklist" aria-label="Чек-лист">
      {ORDER.map((kind) => {
        const group = favorites.filter((it) => it.kind === kind).sort((a, b) => a.createdAt - b.createdAt);
        if (!group.length) return null;
        const isOpen = !collapsed.has(kind);
        const marked = group.filter((it) => counts.has(it.id)).length;
        return (
          <div key={kind} class="check-group">
            <h3>
              <button type="button" class="group-toggle" aria-expanded={isOpen} onClick={() => toggle(kind)}>
                <span aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
                {KIND_PLURAL[kind]}
                <span class="muted">
                  {' '}
                  · {marked} из {group.length}
                </span>
              </button>
            </h3>
            {isOpen && (
            <div class="chips">
              {group.map((it) => {
                const n = counts.get(it.id) ?? 0;
                return (
                  <button
                    type="button"
                    key={it.id}
                    class={`chip chip-check${n ? ' done' : ''}`}
                    aria-label={`${it.name}${n ? `, отмечено ${n} раз` : ''}. Нажми, чтобы отметить`}
                    onClick={() => void mark(it)}
                  >
                    <span class="chip-mark" aria-hidden="true">
                      {n ? '✓' : '+'}
                    </span>
                    <span>{it.name}</span>
                    {n > 1 && <span class="chip-count">×{n}</span>}
                  </button>
                );
              })}
            </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
