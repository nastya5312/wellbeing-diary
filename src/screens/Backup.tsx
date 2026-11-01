import { useState } from 'preact/hooks';
import { getDb } from '../db/schema';
import { getSettings, updateSettings } from '../db/repo';
import { createBackup, importBackup, readBackupFile, shareBackup, type BackupFile, type ImportMode } from '../lib/backup';
import { useLive } from '../lib/useLive';
import { buildCsvFiles } from '../lib/csv';
import { shareFiles } from '../lib/share';
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

  const save = async (how: 'share' | 'download') => {
    setBusy(true);
    await safe(async () => {
      const data = await createBackup(db);
      if (await shareBackup(data, how)) {
        await updateSettings(db, { lastExportAt: data.exportedAt });
        notify('Копия создана');
      }
    });
    setBusy(false);
  };

  const exportCsv = async () => {
    setBusy(true);
    await safe(async () => {
      const data = await createBackup(db);
      const stamp = localDate(new Date());
      const files = buildCsvFiles(data).map((f) => ({
        name: f.name.replace('.csv', `-${stamp}.csv`),
        blob: new Blob([f.text], { type: 'text/csv' }),
      }));
      await shareFiles(files);
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
        <button type="button" class="btn btn-primary btn-block" disabled={busy} onClick={() => save('share')}>
          Сохранить копию
        </button>
        <ol class="steps small">
          <li>«Сохранить копию» → «Сохранить в Файлы».</li>
          <li>
            Если вверху окна написано <strong>iCloud Drive › Загрузки</strong> — сразу жми «Сохранить». Эта папка
            уже в облаке, никуда переходить не нужно.
          </li>
          <li>Если там «На iPhone» — один раз выбери iCloud Drive. Обычно iOS запоминает последнюю папку.</li>
        </ol>
        <button type="button" class="btn btn-block" disabled={busy} onClick={() => save('download')}>
          Быстрый вариант: скачать в «Загрузки»
        </button>
        <p class="muted small">
          Быстрый вариант сохраняет файл сразу, без выбора папки (на iPhone ещё не проверено — если не сработает,
          пользуйся кнопкой выше). Копия в iCloud Drive переживёт потерю телефона. Раз в неделю приложение напомнит.
        </p>
        <a class="btn btn-link" href="shareddocuments://">
          Открыть «Файлы», чтобы проверить копию
        </a>
      </section>

      <section class="panel">
        <h2>Таблицы для Excel / Numbers</h2>
        <p class="small">
          5 файлов CSV: записи, дни, показатели, курсы, справочник. Удобно посмотреть или посчитать что-то своё. Для восстановления
          они не подходят — для этого нужна копия выше.
        </p>
        <button type="button" class="btn btn-block" disabled={busy} onClick={() => void exportCsv()}>
          Сохранить таблицы CSV
        </button>
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
