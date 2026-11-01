import { useEffect, useState } from 'preact/hooks';
import { getDb } from '../db/schema';
import { getDay, saveDay } from '../db/repo';
import { Sheet } from '../components/Sheet';
import { safe, notify } from '../lib/notify';
import { formatDateLong } from '../lib/dates';

// Заметка к дню.
export function NoteSheet({ date, onClose }: { date: string; onClose: () => void }) {
  const [note, setNote] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void safe(() => getDay(getDb(), date)).then((d) => {
      setNote(d?.note ?? '');
      setLoaded(true);
    });
  }, [date]);

  const save = async () => {
    const ok = await safe(async () => (await saveDay(getDb(), date, { note: note.trim() || undefined }), true));
    if (ok) {
      notify('Заметка сохранена');
      onClose();
    }
  };

  return (
    <Sheet
      title={`Заметка · ${formatDateLong(date)}`}
      onClose={onClose}
      footer={
        <button type="button" class="btn btn-primary btn-block" disabled={!loaded} onClick={save}>
          Сохранить
        </button>
      }
    >
      <label class="field">
        <span class="visually-hidden">Заметка</span>
        <textarea rows={6} value={note} maxLength={2000} onInput={(e) => setNote(e.currentTarget.value)} />
      </label>
    </Sheet>
  );
}
