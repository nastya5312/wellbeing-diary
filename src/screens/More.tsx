import { Catalog } from './Catalog';
import { Backup } from './Backup';
import { Metrics } from './Metrics';
import { Report } from './Report';
import { isDemo } from '../db/schema';
import { enterDemo } from '../lib/demo';
import { safe } from '../lib/notify';
import type { Settings } from '../models/types';
import { StorageStatus } from '../components/StorageStatus';
import { APP_NAME, APP_VERSION } from '../lib/appInfo';

export type MorePage = 'menu' | 'catalog' | 'backup' | 'metrics' | 'report';

export function More({ page, setPage, today, settings }: { page: MorePage; setPage: (p: MorePage) => void; today: string; settings: Settings }) {
  if (page === 'catalog') return <Catalog onBack={() => setPage('menu')} />;
  if (page === 'backup') return <Backup onBack={() => setPage('menu')} />;
  if (page === 'metrics') return <Metrics onBack={() => setPage('menu')} />;
  if (page === 'report') return <Report today={today} onBack={() => setPage('menu')} />;

  const startDemo = () => {
    if (!confirm('Открыть демо с вымышленными данными? Твои записи не изменятся: демо хранится отдельно и удаляется при выходе.')) return;
    void safe(() => enterDemo(today, settings.dayStartsAt));
  };

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
          <button type="button" class="list-btn" onClick={() => setPage('report')}>
            <span>Отчёт для врача</span>
            <span class="muted small">сводка на один лист A4, печать или PDF</span>
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
      {!isDemo() && (
        <button type="button" class="btn btn-block" onClick={startDemo}>
          Посмотреть демо с вымышленными данными
        </button>
      )}
      <p class="muted small">Настройки появятся на следующем этапе.</p>
      <p class="muted small">Все записи хранятся только на этом телефоне и никуда не отправляются.</p>
      <p class="muted small">
        {APP_NAME} · версия {APP_VERSION}
      </p>
    </div>
  );
}
