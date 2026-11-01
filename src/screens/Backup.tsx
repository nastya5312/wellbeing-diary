import { useState } from 'preact/hooks';
import { getDb } from '../db/schema';
import { getSettings, updateSettings } from '../db/repo';
import { createBackup, importBackup, readBackupFile, shareBackup, type BackupFile, type ImportMode } from '../lib/backup';
import { useLive } from '../lib/useLive';
import { safe, notify } from '../lib/notify';
import { daysBetween, formatDateRu, localDate } from '../lib/dates';

// Резервная копия: сохранить файл в «Файлы» (iCloud Drive) и восстановить из него.
export function Backup({ onBack }: { onBack: () => void }) {
  const db = getDb();
  const settings = useLive(() => getSettings(db), []);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ data: BackupFile; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const last = settings?.lastExportAt;
  const ago = last !== undefined ? daysBetween(localDate(new Date(last)), localDate(new Date())) : null;

  const save = async () => {
    setBusy(true);
    await safe(async () => {
      const data = await createBackup(db);
      if (await shareBackup(data)) {
        await updateSettings(db, { lastExportAt: data.exportedAt });
        notify('Копия создана');
      }
    });
    setBusy(false);
  };

  const pick = async (file: File | undefined) => {
    setError(null);
    setPending(null);
    if (!file) return;
    const res = await readBackupFile(file);
    if (res.ok) setPending({ data: res.data, name: file.name });
    else setError(res.error);
  };

  const restore = async (mode: ImportMode) => {
    if (!pending) return;
    if (
      mode === 'replace' &&
      !confirm('Все текущие записи на телефоне будут удалены и заменены записями из файла. Продолжить?')
    ) {
      return;
    }
    setBusy(true);
    const stats = await safe(() => importBackup(db, pending.data, mode));
    setBusy(false);
    if (stats) {
      notify(
        mode === 'replace'
          ? `Восстановлено: дней ${stats.days}, записей ${stats.events}`
          : `Добавлено: дней ${stats.days}, записей ${stats.events}, позиций ${stats.items}`,
      );
      setPending(null);
    }
  };

  return (
    <div class="screen">
      <header class="screen-head row center">
        <button type="button" class="icon-btn" onClick={onBack} aria-label="Назад">
          ‹
        </button>
        <h1>Резервная копия</h1>
      </header>

      <section class="panel">
        <p>
          {last === undefined
            ? 'Копий ещё не было.'
            : `Последняя копия: ${formatDateRu(localDate(new Date(last)))}${ago ? ` (дней назад: ${ago})` : ' (сегодня)'}.`}
        </p>
        <button type="button" class="btn btn-primary btn-block" disabled={busy} onClick={save}>
          Сохранить копию
        </button>
        <ol class="steps small">
          <li>Нажми «Сохранить копию».</li>
          <li>В открывшемся меню выбери «Сохранить в Файлы».</li>
          <li>Выбери «iCloud Drive» → удобную папку (например, «Дневник») → «Сохранить».</li>
        </ol>
        <p class="muted small">
          Копия в iCloud Drive переживёт потерю телефона. Делай её раз в неделю — приложение напомнит.
        </p>
      </section>

      <section class="panel">
        <h2>Восстановить из файла</h2>
        <label class="btn btn-block file-btn">
          Выбрать файл копии
          <input
            type="file"
            accept=".json,application/json"
            class="visually-hidden"
            onChange={(e) => {
              void pick(e.currentTarget.files?.[0]);
              e.currentTarget.value = '';
            }}
          />
        </label>
        {error && (
          <p class="error" role="alert">
            {error}
          </p>
        )}
        {pending && (
          <div class="stack">
            <p>
              Файл «{pending.name}» от {formatDateRu(localDate(new Date(pending.data.exportedAt)))}: дней{' '}
              {pending.data.days.length}, записей {pending.data.events.length}, позиций {pending.data.items.length}.
            </p>
            <button type="button" class="btn btn-block" disabled={busy} onClick={() => restore('merge')}>
              Добавить недостающее (текущие записи сохранятся)
            </button>
            <button type="button" class="btn btn-danger btn-block" disabled={busy} onClick={() => restore('replace')}>
              Заменить всё содержимым файла
            </button>
          </div>
        )}
      </section>

      <section class="panel warn">
        <h2>Важно, чтобы не потерять записи</h2>
        <ul class="small">
          <li>
            <strong>Не удаляй иконку «Дневник» с экрана «Домой»</strong> — вместе с ней iPhone стирает все записи.
          </li>
          <li>Вноси записи только через иконку: в Safari у этого же адреса отдельное, пустое хранилище.</li>
          <li>Записи хранятся только на этом телефоне. Копия в «Файлах» — единственная защита при потере или замене телефона.</li>
        </ul>
      </section>
    </div>
  );
}
