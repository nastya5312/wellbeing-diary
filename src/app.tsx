import { APP_NAME, APP_VERSION } from './lib/appInfo';
import { UpdateToast } from './components/UpdateToast';

// Этап 1: пустой экран-заглушка. Вкладки и экраны появятся на этапе 3.
export function App() {
  return (
    <div class="app">
      <header class="app-header">
        <h1>Дневник</h1>
      </header>
      <main class="app-main">
        <p class="muted">{APP_NAME} · версия {APP_VERSION}</p>
        <p>Здесь скоро появится экран «Сегодня».</p>
        <p class="muted small">Все записи хранятся только на этом телефоне.</p>
      </main>
      <UpdateToast />
    </div>
  );
}
