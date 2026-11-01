import { Catalog } from './Catalog';
import { Backup } from './Backup';
import { Metrics } from './Metrics';
import { StorageStatus } from '../components/StorageStatus';
import { APP_NAME, APP_VERSION } from '../lib/appInfo';

export type MorePage = 'menu' | 'catalog' | 'backup' | 'metrics';

export function More({ page, setPage }: { page: MorePage; setPage: (p: MorePage) => void }) {
  if (page === 'catalog') return <Catalog onBack={() => setPage('menu')} />;
  if (page === 'backup') return <Backup onBack={() => setPage('menu')} />;
  if (page === 'metrics') return <Metrics onBack={() => setPage('menu')} />;

  return (
    <div class="screen">
      <header class="screen-head">
        <h1>Ещё</h1>
      </header>
      <ul class="list">
        <li>
          <button type="button" class="list-btn" onClick={() => setPage('backup')}>
            <span>Резервная копия</span>
            <span class="muted small">сохранить в «Файлы» / восстановить</span>
          </button>
        </li>
        <li>
          <button type="button" class="list-btn" onClick={() => setPage('metrics')}>
            <span>Анализы и показатели</span>
            <span class="muted small">результаты анализов, вес, давление — с графиком</span>
          </button>
        </li>
        <li>
          <button type="button" class="list-btn" onClick={() => setPage('catalog')}>
            <span>Справочник</span>
            <span class="muted small">добавить и изменить позиции, курсы приёма, вставить список</span>
          </button>
        </li>
      </ul>
      <StorageStatus />
      <p class="muted small">Настройки и отчёт для врача появятся на следующих этапах.</p>
      <p class="muted small">Все записи хранятся только на этом телефоне и никуда не отправляются.</p>
      <p class="muted small">
        {APP_NAME} · версия {APP_VERSION}
      </p>
    </div>
  );
}
