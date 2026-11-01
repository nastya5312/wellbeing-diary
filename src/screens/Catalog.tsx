import { useState } from 'preact/hooks';
import { ITEM_KINDS, type Item, type ItemKind } from '../models/types';
import { getDb } from '../db/schema';
import { addItem, countItemEvents, deleteItem, listItems, mergeItems, updateItem } from '../db/repo';
import { Sheet } from '../components/Sheet';
import { ItemForm, type ItemDraft } from '../components/ItemForm';
import { useLive } from '../lib/useLive';
import { safe, notify } from '../lib/notify';
import { KIND_PLURAL } from '../lib/labels';

// Справочник: позиции по типам, переименование, теги, избранное, архив, объединение дублей.
export function Catalog({ onBack }: { onBack: () => void }) {
  const db = getDb();
  const [kind, setKind] = useState<ItemKind>('food');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [creating, setCreating] = useState(false);

  const items = useLive(() => listItems(db, { kind, includeArchived: true }), [kind]);
  const counts = useLive(
    async () => {
      const list = await listItems(db, { kind, includeArchived: true });
      const n = await Promise.all(list.map((it) => countItemEvents(db, it.id)));
      return new Map(list.map((it, i) => [it.id, n[i]!]));
    },
    [kind],
  );

  const active = (items ?? []).filter((it) => !it.archived).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const archived = (items ?? []).filter((it) => it.archived).sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  return (
    <div class="screen">
      <header class="screen-head row center">
        <button type="button" class="icon-btn" onClick={onBack} aria-label="Назад">
          ‹
        </button>
        <h1>Справочник</h1>
      </header>

      <div class="chips scroll-x" role="tablist" aria-label="Тип">
        {ITEM_KINDS.map((k) => (
          <button
            type="button"
            role="tab"
            key={k}
            aria-selected={kind === k}
            class={`chip${kind === k ? ' active' : ''}`}
            onClick={() => setKind(k)}
          >
            {KIND_PLURAL[k]}
          </button>
        ))}
      </div>

      <button type="button" class="btn btn-block" onClick={() => setCreating(true)}>
        + Добавить
      </button>

      <ul class="list">
        {active.map((it) => (
          <ItemRow key={it.id} item={it} count={counts?.get(it.id)} onTap={() => setEditing(it)} />
        ))}
        {items && active.length === 0 && <li class="muted empty">Пусто. Позиции появятся, когда ты их добавишь.</li>}
      </ul>

      {archived.length > 0 && (
        <>
          <button type="button" class="btn btn-link" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? 'Скрыть архив' : `Архив (${archived.length})`}
          </button>
          {showArchived && (
            <ul class="list">
              {archived.map((it) => (
                <ItemRow key={it.id} item={it} count={counts?.get(it.id)} onTap={() => setEditing(it)} />
              ))}
            </ul>
          )}
        </>
      )}

      {editing && <ItemEditor item={editing} onClose={() => setEditing(null)} />}
      {creating && <ItemCreator kind={kind} onClose={() => setCreating(false)} />}
    </div>
  );
}

function ItemRow({ item, count, onTap }: { item: Item; count?: number; onTap: () => void }) {
  return (
    <li>
      <button type="button" class="list-btn" onClick={onTap}>
        <span>
          {item.favorite && '★ '}
          {item.name}
        </span>
        <span class="muted small">
          {[item.tags.join(', '), count !== undefined && `записей: ${count}`].filter(Boolean).join(' · ')}
        </span>
      </button>
    </li>
  );
}

function ItemCreator({ kind, onClose }: { kind: ItemKind; onClose: () => void }) {
  const [draft, setDraft] = useState<ItemDraft>({ name: '', tags: [], favorite: false });
  const create = async () => {
    const it = await safe(() => addItem(getDb(), { kind, ...draft }));
    if (it) {
      notify(`Добавлено: ${it.name}`);
      onClose();
    }
  };
  return (
    <Sheet
      title={`Новое: ${KIND_PLURAL[kind].toLowerCase()}`}
      onClose={onClose}
      footer={
        <button type="button" class="btn btn-primary btn-block" disabled={!draft.name.trim()} onClick={create}>
          Создать
        </button>
      }
    >
      <ItemForm kind={kind} draft={draft} onChange={setDraft} />
    </Sheet>
  );
}

function ItemEditor({ item, onClose }: { item: Item; onClose: () => void }) {
  const db = getDb();
  const [draft, setDraft] = useState<ItemDraft>({ name: item.name, tags: item.tags, favorite: item.favorite });
  const [merging, setMerging] = useState(false);
  const count = useLive(() => countItemEvents(db, item.id), [item.id]);
  const others = useLive(
    async () => (await listItems(db, { kind: item.kind, includeArchived: true })).filter((it) => it.id !== item.id),
    [item.id],
  );

  const save = async () => {
    const ok = await safe(async () => (await updateItem(db, item.id, draft), true));
    if (ok) {
      notify('Сохранено');
      onClose();
    }
  };
  const setArchived = async (archived: boolean) => {
    const ok = await safe(async () => (await updateItem(db, item.id, { ...draft, archived }), true));
    if (ok) {
      notify(archived ? 'Перенесено в архив' : 'Возвращено из архива');
      onClose();
    }
  };
  const remove = async () => {
    if (!confirm(`Удалить «${item.name}»?`)) return;
    const ok = await safe(async () => (await deleteItem(db, item.id), true));
    if (ok) {
      notify('Удалено');
      onClose();
    }
  };
  const mergeInto = async (target: Item) => {
    if (!confirm(`Все записи «${item.name}» (${count ?? 0}) перейдут в «${target.name}». Позиция «${item.name}» исчезнет. Продолжить?`)) return;
    const ok = await safe(async () => (await mergeItems(db, item.id, target.id), true));
    if (ok) {
      notify(`Объединено с «${target.name}»`);
      onClose();
    }
  };

  if (merging) {
    return (
      <Sheet title={`Объединить «${item.name}» с…`} onClose={onClose} onBack={() => setMerging(false)}>
        <p class="muted small">Выбери позицию, которая останется. Записи и теги перейдут в неё.</p>
        <ul class="list">
          {(others ?? []).map((it) => (
            <li key={it.id}>
              <button type="button" class="list-btn" onClick={() => mergeInto(it)}>
                <span>
                  {it.name}
                  {it.archived ? ' (в архиве)' : ''}
                </span>
              </button>
            </li>
          ))}
          {others && others.length === 0 && <li class="muted empty">Нет других позиций этого типа</li>}
        </ul>
      </Sheet>
    );
  }

  return (
    <Sheet
      title="Позиция"
      onClose={onClose}
      footer={
        <button type="button" class="btn btn-primary btn-block" disabled={!draft.name.trim()} onClick={save}>
          Сохранить
        </button>
      }
    >
      <ItemForm kind={item.kind} draft={draft} onChange={setDraft} selfId={item.id} />
      <p class="muted small">Записей с этой позицией: {count ?? '…'}</p>
      <div class="stack">
        <button type="button" class="btn btn-block" onClick={() => setMerging(true)}>
          Объединить с другой (дубль)
        </button>
        <button type="button" class="btn btn-block" onClick={() => setArchived(!item.archived)}>
          {item.archived ? 'Вернуть из архива' : 'В архив (скрыть из выбора, записи сохранятся)'}
        </button>
        {count === 0 && (
          <button type="button" class="btn btn-danger btn-block" onClick={remove}>
            Удалить
          </button>
        )}
      </div>
    </Sheet>
  );
}
