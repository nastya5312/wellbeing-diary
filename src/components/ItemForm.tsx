import { useEffect, useState } from 'preact/hooks';
import type { Item, ItemKind } from '../models/types';
import { getDb } from '../db/schema';
import { findSimilarItems } from '../db/repo';
import { FOOD_TAG_SUGGESTIONS } from '../db/defaults';
import { normalizeName } from '../lib/similar';

export type ItemDraft = { name: string; tags: string[]; favorite: boolean };

type Props = {
  kind: ItemKind;
  draft: ItemDraft;
  onChange: (d: ItemDraft) => void;
  /** id редактируемой позиции — её саму не показывать среди похожих */
  selfId?: string;
  /** Выбор существующей похожей позиции вместо создания новой */
  onPickExisting?: (item: Item) => void;
};

// Поля позиции справочника: название, теги, избранное. Подсказывает похожие, чтобы не было дублей.
export function ItemForm({ kind, draft, onChange, selfId, onPickExisting }: Props) {
  const [similar, setSimilar] = useState<Item[]>([]);
  const [tagInput, setTagInput] = useState('');
  const withTags = kind !== 'symptom';

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      void findSimilarItems(getDb(), kind, draft.name).then((list) => {
        if (alive) setSimilar(list.filter((it) => it.id !== selfId));
      });
    }, 200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [kind, draft.name, selfId]);

  const toggleTag = (tag: string) => {
    const has = draft.tags.includes(tag);
    onChange({ ...draft, tags: has ? draft.tags.filter((t) => t !== tag) : [...draft.tags, tag] });
  };
  const addCustomTag = () => {
    const t = normalizeName(tagInput);
    if (t && !draft.tags.includes(t)) onChange({ ...draft, tags: [...draft.tags, t] });
    setTagInput('');
  };
  const suggestions = kind === 'food' || kind === 'drink' ? FOOD_TAG_SUGGESTIONS : [];
  const allTags = [...new Set([...suggestions, ...draft.tags])];

  return (
    <div class="form">
      <label class="field">
        <span>Название</span>
        <input
          type="text"
          value={draft.name}
          maxLength={80}
          autoComplete="off"
          onInput={(e) => onChange({ ...draft, name: e.currentTarget.value })}
        />
      </label>

      {similar.length > 0 && (
        <div class="hint-box">
          <p>Похоже, такая позиция уже есть:</p>
          <div class="chips">
            {similar.map((it) =>
              onPickExisting ? (
                <button type="button" key={it.id} class="chip" onClick={() => onPickExisting(it)}>
                  Выбрать «{it.name}»{it.archived ? ' (в архиве)' : ''}
                </button>
              ) : (
                <span key={it.id} class="chip chip-static">
                  {it.name}
                  {it.archived ? ' (в архиве)' : ''}
                </span>
              ),
            )}
          </div>
        </div>
      )}

      {withTags && (
        <div class="field">
          <span>Теги {kind === 'food' && <span class="muted small">— объединяют похожие блюда для анализа</span>}</span>
          {allTags.length > 0 && (
            <div class="chips">
              {allTags.map((t) => (
                <button
                  type="button"
                  key={t}
                  class={`chip${draft.tags.includes(t) ? ' active' : ''}`}
                  aria-pressed={draft.tags.includes(t)}
                  onClick={() => toggleTag(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
          <div class="row">
            <input
              type="text"
              placeholder="Свой тег"
              value={tagInput}
              maxLength={30}
              onInput={(e) => setTagInput(e.currentTarget.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomTag())}
            />
            <button type="button" class="btn" onClick={addCustomTag} disabled={!tagInput.trim()}>
              Добавить
            </button>
          </div>
        </div>
      )}

      <label class="check">
        <input type="checkbox" checked={draft.favorite} onChange={(e) => onChange({ ...draft, favorite: e.currentTarget.checked })} />
        <span>В избранное (показывать первым)</span>
      </label>
    </div>
  );
}
