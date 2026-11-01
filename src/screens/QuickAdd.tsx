import { useEffect, useState } from 'preact/hooks';
import type { DiaryEvent, Item, ItemKind, Scale5, Settings } from '../models/types';
import { getDb } from '../db/schema';
import { addEvent, addItem, deleteEvent, listItems, listRecentItems, updateEvent, updateItem } from '../db/repo';
import { Sheet } from '../components/Sheet';
import { Scale } from '../components/Scale';
import { ItemForm, type ItemDraft } from '../components/ItemForm';
import { useLive } from '../lib/useLive';
import { safe, notify } from '../lib/notify';
import { INTENSITY_LABELS, KIND_LABEL } from '../lib/labels';
import { IconBadge } from '../components/Icon';
import { diaryDate, localTime, tsFromDiaryDate } from '../lib/dates';
import { matchesSearch } from '../lib/similar';

const ADD_KINDS: ItemKind[] = ['food', 'drink', 'med', 'supplement', 'symptom', 'activity', 'other'];

type Props = {
  settings: Settings;
  /** Дата дневника по умолчанию */
  date: string;
  /** Тип, если открыли с плитки — шаг 1 пропускается */
  kind?: ItemKind;
  /** Правка существующей записи */
  edit?: { event: DiaryEvent; item: Item };
  onClose: () => void;
};

type Step = 'kind' | 'item' | 'create' | 'details';

// Быстрое добавление события: тип → позиция → детали → «Сохранить».
// Для избранного: плитка → чип → «Сохранить» = 3 касания.
export function QuickAdd({ settings, date, kind: initialKind, edit, onClose }: Props) {
  const [step, setStep] = useState<Step>(edit ? 'details' : initialKind ? 'item' : 'kind');
  const [kind, setKind] = useState<ItemKind | undefined>(edit?.item.kind ?? initialKind);
  const [item, setItem] = useState<Item | undefined>(edit?.item);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<ItemDraft>({ name: '', tags: [], favorite: false });

  const isToday = date === diaryDate(Date.now(), settings.dayStartsAt);
  const [evDate, setEvDate] = useState(edit?.event.date ?? date);
  const [time, setTime] = useState(edit ? localTime(edit.event.ts) : isToday ? localTime(Date.now()) : '12:00');
  const [intensity, setIntensity] = useState<number | undefined>(edit?.event.intensity);
  const [amount, setAmount] = useState(edit?.event.amountText ?? '');
  const [note, setNote] = useState(edit?.event.note ?? '');
  const [busy, setBusy] = useState(false);

  const db = getDb();
  const items = useLive(() => (kind ? listItems(db, { kind }) : Promise.resolve([])), [kind]);
  const recent = useLive(() => (kind ? listRecentItems(db, kind) : Promise.resolve([])), [kind]);

  // Сброс деталей при выборе другой позиции (кроме режима правки)
  useEffect(() => {
    if (!edit) {
      setIntensity(undefined);
      setAmount('');
      setNote('');
    }
  }, [item?.id]);

  const pickItem = (it: Item) => {
    setItem(it);
    setStep('details');
  };

  const save = async () => {
    if (!item || busy) return;
    setBusy(true);
    const ts = tsFromDiaryDate(evDate, time, settings.dayStartsAt);
    const fields = {
      intensity: item.kind === 'symptom' ? (intensity as Scale5 | undefined) : undefined,
      amountText: amount.trim() || undefined,
      note: note.trim() || undefined,
    };
    const ok = await safe(async () => {
      if (edit) await updateEvent(db, edit.event.id, { ts, date: evDate, ...fields });
      else await addEvent(db, { itemId: item.id, ts, date: evDate, ...fields });
      return true;
    });
    setBusy(false);
    if (ok) {
      notify(edit ? 'Изменено' : `Добавлено: ${item.name}`);
      onClose();
    }
  };

  const remove = async () => {
    if (!edit) return;
    const ok = await safe(async () => (await deleteEvent(db, edit.event.id), true));
    if (ok) {
      notify('Запись удалена');
      onClose();
    }
  };

  const createItem = async () => {
    if (!kind || busy) return;
    setBusy(true);
    const created = await safe(() => addItem(db, { kind, ...draft }));
    setBusy(false);
    if (created) pickItem(created);
  };

  const toggleFavorite = async () => {
    if (!item) return;
    const favorite = !item.favorite;
    const ok = await safe(async () => (await updateItem(db, item.id, { favorite }), true));
    if (ok) setItem({ ...item, favorite });
  };

  // ---------- Шаг 1: тип ----------
  if (step === 'kind') {
    return (
      <Sheet title="Что добавить?" onClose={onClose}>
        <div class="tiles">
          {ADD_KINDS.map((k) => (
            <button type="button" key={k} class="tile" onClick={() => (setKind(k), setStep('item'))}>
              <IconBadge name={k} tone={k} size={44} />
              <span>{KIND_LABEL[k]}</span>
            </button>
          ))}
        </div>
      </Sheet>
    );
  }

  if (!kind) return null;

  // ---------- Шаг 2: выбор позиции ----------
  // Сверху поиск; без поиска — быстрый выбор (недавние и избранные, без повторов) и полный список по алфавиту.
  if (step === 'item') {
    const all = items ?? [];
    const q = query.trim();
    const quick: Item[] = [];
    for (const it of [...(recent ?? []), ...all.filter((x) => x.favorite)]) {
      if (!quick.some((x) => x.id === it.id) && quick.length < 8) quick.push(it);
    }
    const found = all
      .filter((it) => matchesSearch(it.name, query))
      .sort((a, b) => (q ? b.useCount - a.useCount : 0) || a.name.localeCompare(b.name, 'ru'));
    const exact = all.some((it) => it.name.trim().toLowerCase() === q.toLowerCase());
    const create = () => {
      setDraft({ name: q, tags: [], favorite: false });
      setStep('create');
    };
    return (
      <Sheet title={KIND_LABEL[kind]} onClose={onClose} onBack={initialKind ? undefined : () => setStep('kind')}>
        <div class="form" style={{ gap: '14px' }}>
          <label class="field">
            <span class="visually-hidden">Поиск</span>
            <input type="search" placeholder={`Найти или создать: ${KIND_LABEL[kind].toLowerCase()}`} value={query} onInput={(e) => setQuery(e.currentTarget.value)} />
          </label>

          {!q && quick.length > 0 && (
            <section>
              <h3>Быстрый выбор</h3>
              <div class="chips">
                {quick.map((it) => (
                  <button type="button" key={it.id} class="chip chip-big" onClick={() => pickItem(it)}>
                    {it.name}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section>
            {!q && all.length > 0 && <h3>Все ({all.length})</h3>}
            <div class="group">
              {q && !exact && (
                <button type="button" class="row-btn" onClick={create}>
                  <IconBadge name="plus" tone="accent" size={30} />
                  <span class="row-main">
                    <span class="row-title" style={{ color: 'var(--accent)' }}>Создать «{q}»</span>
                  </span>
                </button>
              )}
              {found.map((it) => (
                <button type="button" key={it.id} class="row-btn" onClick={() => pickItem(it)}>
                  <IconBadge name={kind} tone={kind} size={30} />
                  <span class="row-main">
                    <span class="row-title">{it.name}</span>
                    {it.tags.length > 0 && <span class="row-sub">{it.tags.join(', ')}</span>}
                  </span>
                  {it.favorite && (
                    <span class="muted small" aria-label="в чек-листе">
                      ★
                    </span>
                  )}
                </button>
              ))}
              {!q && (
                <button type="button" class="row-btn" onClick={create}>
                  <IconBadge name="plus" tone="accent" size={30} />
                  <span class="row-main">
                    <span class="row-title" style={{ color: 'var(--accent)' }}>Создать новое</span>
                  </span>
                </button>
              )}
            </div>
            {items && q && found.length === 0 && exact === false && (
              <p class="muted small" style={{ margin: '8px 4px 0' }}>Такого пока нет — можно создать.</p>
            )}
          </section>
        </div>
      </Sheet>
    );
  }

  // ---------- Создание позиции ----------
  if (step === 'create') {
    return (
      <Sheet
        title={`Новое: ${KIND_LABEL[kind].toLowerCase()}`}
        onClose={onClose}
        onBack={() => setStep('item')}
        footer={
          <button type="button" class="btn btn-primary btn-block" disabled={!draft.name.trim() || busy} onClick={createItem}>
            Создать
          </button>
        }
      >
        <ItemForm kind={kind} draft={draft} onChange={setDraft} onPickExisting={pickItem} />
      </Sheet>
    );
  }

  // ---------- Шаг 3: детали ----------
  if (!item) return null;
  return (
    <Sheet
      title={edit ? 'Правка записи' : KIND_LABEL[kind]}
      onClose={onClose}
      onBack={edit ? undefined : () => setStep('item')}
      footer={
        <button type="button" class="btn btn-primary btn-block" disabled={busy} onClick={save}>
          Сохранить
        </button>
      }
    >
      <div class="item-title">
        <strong>{item.name}</strong>
        <button
          type="button"
          class={`icon-btn star${item.favorite ? ' active' : ''}`}
          aria-pressed={item.favorite}
          aria-label={item.favorite ? 'Убрать из избранного' : 'В избранное'}
          onClick={toggleFavorite}
        >
          {item.favorite ? '★' : '☆'}
        </button>
      </div>
      <div class="form">
        <div class="row">
          <label class="field grow">
            <span>Дата</span>
            <input type="date" value={evDate} required onInput={(e) => e.currentTarget.value && setEvDate(e.currentTarget.value)} />
          </label>
          <label class="field grow">
            <span>Время</span>
            <input type="time" value={time} required onInput={(e) => e.currentTarget.value && setTime(e.currentTarget.value)} />
          </label>
        </div>
        {kind === 'symptom' && (
          <Scale label="Интенсивность" value={intensity} onChange={setIntensity} labels={INTENSITY_LABELS} />
        )}
        {(kind === 'med' || kind === 'supplement') && (
          <label class="field">
            <span>Количество (как удобно)</span>
            <input type="text" value={amount} maxLength={60} placeholder="например, 1 шт." onInput={(e) => setAmount(e.currentTarget.value)} />
          </label>
        )}
        <label class="field">
          <span>Заметка</span>
          <textarea rows={2} value={note} maxLength={500} onInput={(e) => setNote(e.currentTarget.value)} />
        </label>
        {edit && (
          <button type="button" class="btn btn-danger btn-block" onClick={remove}>
            Удалить запись
          </button>
        )}
      </div>
    </Sheet>
  );
}
