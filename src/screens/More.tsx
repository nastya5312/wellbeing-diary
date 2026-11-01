import { useState } from 'preact/hooks';
import { Catalog } from './Catalog';
import { APP_NAME, APP_VERSION } from '../lib/appInfo';

export function More() {
  const [page, setPage] = useState<'menu' | 'catalog'>('menu');
  if (page === 'catalog') return <Catalog onBack={() => setPage('menu')} />;

  return (
    <div class="screen">
      <header class="screen-head">
        <h1>Ещё</h1>
      </header>
      <ul class="list">
        <li>
          <button type="button" class="list-btn" onClick={() => setPage('catalog')}>
            <span>Справочник</span>
            <span class="muted small">еда, напитки, лекарства, добавки, симптомы</span>
          </button>
        </li>
      </ul>
      <p class="muted small">Экспорт, настройки и отчёт для врача появятся на следующих этапах.</p>
      <p class="muted small">Все записи хранятся только на этом телефоне и никуда не отправляются.</p>
      <p class="muted small">
        {APP_NAME} · версия {APP_VERSION}
      </p>
    </div>
  );
}
