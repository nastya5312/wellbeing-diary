import { useState } from 'preact/hooks';
import type { DiaryEvent, ItemKind, Scale5 } from '../models/types';
import { getDb } from '../db/schema';
import { addEvent, addItem } from '../db/repo';
import { guessKind, parseQuick, type ParsedPart } from '../lib/quickParse';
import { INTENSITY_LABELS, KIND_LABEL } from '../lib/labels';
import { localTime, tsFromDiaryDate } from '../lib/dates';
import { notify, safe } from '../lib/notify';
import { Sheet } from './Sheet';
import { Icon, IconBadge } from './Icon';

const NEW_KINDS: ItemKind[] = ['food', 'drink', 'symptom', 'med', 'supplement', 'activity'];

type Row = ParsedPart & { key: number; kind?: ItemKind; skip?: boolean };

// Запись одной строкой или голосом (микрофон на клавиатуре iPhone превращает речь в текст).
export function QuickLine({ date, dayStartsAt, defaultTs, onClose }: { date: string; dayStartsAt: string; defaultTs: () => number; onClose: () => void }) {
  const db = getDb();
  const [text, setText] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);

  const parse = async () => {
    const items = await db.items.toArray();
    const parsed = parseQuick(text, items);
    if (!parsed.length) {
      notify('Не нашла, что записать. Пример: «кофе в 8:30, овсянка, вздутие сильное»', 'error');
      return;
    }
    setRows(parsed.map((p, key) => ({ ...p, key, ...(p.newName && { kind: guessKind(p.text) }) })));
  };

  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs!.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const todo = (rows ?? []).filter((r) => !r.skip && (r.item || r.kind));

  const save = async () => {
    setBusy(true);
    const created = await safe(async () => {
      const out: DiaryEvent[] = [];
      for (const r of todo) {
        const item = r.item ?? (await addItem(db, { kind: r.kind!, name: r.newName! }));
        const ts = r.time ? tsFromDiaryDate(date, r.time, dayStartsAt) : defaultTs();
        out.push(await addEvent(db, { itemId: item.id, ts, date, ...(item.kind === 'symptom' && r.intensity && { intensity: r.intensity as Scale5 }) }));
      }
      return out;
    });
    setBusy(false);
    if (created) {
      notify(`Добавлено записей: ${created.length}`, 'info', {
        label: 'Отменить',
        run: () => void safe(() => db.events.bulkDelete(created.map((e) => e.id))),
      });
      onClose();
    }
  };

  if (!rows) {
    return (
      <Sheet
        title="Записать одной строкой"
        onClose={onClose}
        footer={
          <button type="button" class="btn btn-primary btn-block" disabled={!text.trim()} onClick={() => void parse()}>
            Разобрать
          </button>
        }
      >
        <div class="form">
          <label class="field">
            <span class="visually-hidden">Что было</span>
            <textarea
              rows={4}
              value={text}
              autoFocus
              placeholder="Например: кофе в 8:30, овсянка, вздутие сильное"
              onInput={(e) => setText(e.currentTarget.value)}
            />
          </label>
          <p class="muted small" style={{ margin: 0 }}>
            Можно надиктовать: нажми микрофон на клавиатуре и говори. Через запятую или «и» — несколько записей. Время — «в 9:30»
            или «в 14». Сила симптома — «слабо», «сильно» или цифра от 1 до 5. Без времени запись получит текущее время.
          </p>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      title="Проверь записи"
      onClose={onClose}
      onBack={() => setRows(null)}
      footer={
        <button type="button" class="btn btn-primary btn-block" disabled={!todo.length || busy} onClick={() => void save()}>
          {todo.length ? `Добавить записей: ${todo.length}` : 'Нечего добавлять'}
        </button>
      }
    >
      <div class="group">
        {rows.map((r) => (
          <div key={r.key} class={`row-btn ql-row${r.skip ? ' ql-skip' : ''}`}>
            <IconBadge name={r.item?.kind ?? r.kind ?? 'other'} tone={r.item?.kind ?? r.kind ?? 'other'} size={32} />
            <span class="row-main">
              {r.item ? (
                <>
                  <span class="row-title">{r.item.name}</span>
                  <span class="row-sub">
                    {r.time ?? `${localTime(defaultTs())} (без времени — сейчас)`}
                    {r.intensity ? `, ${INTENSITY_LABELS[r.intensity - 1]}` : ''}
                  </span>
                </>
              ) : (
                <>
                  <span class="row-title">«{r.newName}» — новое</span>
                  <span class="chips ql-kinds">
                    {NEW_KINDS.map((k) => (
                      <button type="button" key={k} class={`chip${r.kind === k && !r.skip ? ' active' : ''}`} onClick={() => update(r.key, { kind: k, skip: false })}>
                        {KIND_LABEL[k]}
                      </button>
                    ))}
                  </span>
                </>
              )}
            </span>
            <button
              type="button"
              class="icon-btn"
              aria-label={r.skip ? 'Вернуть' : 'Не добавлять'}
              onClick={() => update(r.key, { skip: !r.skip })}
            >
              <Icon name={r.skip ? 'refresh' : 'close'} size={18} />
            </button>
          </div>
        ))}
      </div>
      <p class="muted small">
        Если что-то распозналось не так — убери строку крестиком и добавь вручную. Новые позиции попадут в справочник.
      </p>
    </Sheet>
  );
}
