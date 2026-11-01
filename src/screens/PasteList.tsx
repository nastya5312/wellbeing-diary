import { useState } from 'preact/hooks';
import { getDb } from '../db/schema';
import { importListEntries } from '../db/repo';
import { Sheet } from '../components/Sheet';
import { parseList, type ListEntry } from '../lib/pasteList';
import { safe, notify } from '../lib/notify';
import { KIND_PLURAL } from '../lib/labels';
import { ITEM_KINDS } from '../models/types';

const EXAMPLE = `Лекарство: название
Добавка: название
Симптом: название
Еда: название | молочное, сахар
Напиток: название
Активность: название`;

// Вставка списка позиций текстом (например, собранного в чате с Claude). Данные остаются только на телефоне.
export function PasteList({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<{ entries: ListEntry[]; skipped: number } | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [favorite, setFavorite] = useState(true);
  const [busy, setBusy] = useState(false);

  const pasteFromClipboard = async () => {
    try {
      setText(await navigator.clipboard.readText());
    } catch {
      notify('Не удалось прочитать буфер обмена. Нажми в поле и выбери «Вставить».', 'error');
    }
  };

  const check = () => {
    const res = parseList(text);
    setParsed(res);
    setSelected(new Set(res.entries.map((_, i) => i)));
  };

  const add = async () => {
    if (!parsed) return;
    setBusy(true);
    const chosen = parsed.entries.filter((_, i) => selected.has(i));
    const res = await safe(() => importListEntries(getDb(), chosen, favorite));
    setBusy(false);
    if (res) {
      notify(`Добавлено новых: ${res.added}${res.updated ? `, уже были: ${res.updated}` : ''}`);
      onClose();
    }
  };

  if (!parsed) {
    return (
      <Sheet
        title="Вставить список"
        onClose={onClose}
        footer={
          <button type="button" class="btn btn-primary btn-block" disabled={!text.trim()} onClick={check}>
            Проверить
          </button>
        }
      >
        <div class="form">
          <p class="small">Одна позиция в строке. Строки без типа (заголовки, пояснения) будут пропущены.</p>
          <pre class="example small">{EXAMPLE}</pre>
          <button type="button" class="btn btn-block" onClick={pasteFromClipboard}>
            Вставить из буфера обмена
          </button>
          <label class="field">
            <span class="visually-hidden">Список</span>
            <textarea rows={8} value={text} onInput={(e) => setText(e.currentTarget.value)} placeholder="Или вставь сюда вручную" />
          </label>
        </div>
      </Sheet>
    );
  }

  const count = selected.size;
  return (
    <Sheet
      title="Проверь список"
      onClose={onClose}
      onBack={() => setParsed(null)}
      footer={
        <button type="button" class="btn btn-primary btn-block" disabled={!count || busy} onClick={add}>
          Добавить ({count})
        </button>
      }
    >
      <p class="small">
        Найдено позиций: {parsed.entries.length}
        {parsed.skipped ? `, пропущено строк без типа: ${parsed.skipped}` : ''}. Сними галочки с того, что не нужно.
      </p>
      {parsed.entries.length === 0 && <p class="error">Не найдено ни одной строки вида «Тип: название».</p>}
      {ITEM_KINDS.map((kind) => {
        const rows = parsed.entries.map((e, i) => ({ e, i })).filter(({ e }) => e.kind === kind);
        if (!rows.length) return null;
        return (
          <section key={kind} class="pick-group">
            <h3>{KIND_PLURAL[kind]}</h3>
            {rows.map(({ e, i }) => (
              <label key={i} class="check">
                <input
                  type="checkbox"
                  checked={selected.has(i)}
                  onChange={(ev) => {
                    const next = new Set(selected);
                    if (ev.currentTarget.checked) next.add(i);
                    else next.delete(i);
                    setSelected(next);
                  }}
                />
                <span>
                  {e.name}
                  {e.tags.length > 0 && <span class="muted small block">{e.tags.join(', ')}</span>}
                </span>
              </label>
            ))}
          </section>
        );
      })}
      <label class="check check-big">
        <input type="checkbox" checked={favorite} onChange={(e) => setFavorite(e.currentTarget.checked)} />
        <span>
          Добавить в избранное
          <span class="muted small block">Избранное показывается чек-листом на экране «Сегодня»: одно касание — отмечено.</span>
        </span>
      </label>
    </Sheet>
  );
}
