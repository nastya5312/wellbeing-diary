import { useEffect, useState } from 'preact/hooks';
import { APP_NAME, APP_VERSION } from './lib/appInfo';
import { UpdateToast } from './components/UpdateToast';
import { getDb } from './db/schema';
import { getSettings } from './db/repo';
import { diaryDate, weekdayRu } from './lib/dates';
import { requestPersistentStorage, storageErrorMessage } from './lib/storage';

// Этап 2: база подключается при старте. Экраны и вкладки появятся на этапе 3.
export function App() {
  const [today, setToday] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void requestPersistentStorage();
    getSettings(getDb())
      .then((s) => setToday(diaryDate(Date.now(), s.dayStartsAt)))
      .catch((e: unknown) => setError(storageErrorMessage(e)));
  }, []);

  return (
    <div class="app">
      <header class="app-header">
        <h1>Дневник</h1>
      </header>
      <main class="app-main">
        {error && (
          <p class="error" role="alert">
            {error}
          </p>
        )}
        {today && (
          <p>
            Сегодня: {formatDateRu(today)}, {weekdayRu(today)}
          </p>
        )}
        <p>Здесь скоро появится экран «Сегодня».</p>
        <p class="muted small">Все записи хранятся только на этом телефоне.</p>
        <p class="muted small">
          {APP_NAME} · версия {APP_VERSION}
        </p>
      </main>
      <UpdateToast />
    </div>
  );
}

function formatDateRu(date: string): string {
  const [y, m, d] = date.split('-');
  return `${d}.${m}.${y}`;
}
