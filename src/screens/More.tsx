import { Catalog } from './Catalog';
import { Backup } from './Backup';
import { Metrics } from './Metrics';
import { Report } from './Report';
import { SettingsScreen } from './SettingsScreen';
import { isDemo } from '../db/schema';
import { enterDemo } from '../lib/demo';
import { safe } from '../lib/notify';
import type { Settings } from '../models/types';
import { StorageStatus } from '../components/StorageStatus';
import { Icon, IconBadge } from '../components/Icon';
import { APP_NAME, APP_VERSION } from '../lib/appInfo';

export type MorePage = 'menu' | 'catalog' | 'backup' | 'metrics' | 'report' | 'settings';

export function More({ page, setPage, today, settings }: { page: MorePage; setPage: (p: MorePage) => void; today: string; settings: Settings }) {
  if (page === 'catalog') return <Catalog onBack={() => setPage('menu')} />;
  if (page === 'backup') return <Backup onBack={() => setPage('menu')} />;
  if (page === 'metrics') return <Metrics onBack={() => setPage('menu')} />;
  if (page === 'settings') return <SettingsScreen onBack={() => setPage('menu')} onOpenBackup={() => setPage('backup')} />;
  if (page === 'report') return <Report today={today} onBack={() => setPage('menu')} />;

  const startDemo = () => {
    if (!confirm('Открыть демо с вымышленными данными? Твои записи не изменятся: демо хранится отдельно и удаляется при выходе.')) return;
    void safe(() => enterDemo(today, settings.dayStartsAt));
  };

  const Row = ({ page: to, icon, tone, title, sub }: { page: MorePage; icon: string; tone: string; title: string; sub: string }) => (
    <button type="button" class="row-btn" onClick={() => setPage(to)}>
      <IconBadge name={icon} tone={tone} size={34} />
      <span class="row-main">
        <span class="row-title">{title}</span>
        <span class="row-sub">{sub}</span>
      </span>
      <Icon name="chevron" size={16} class="chev" />
    </button>
  );

  return (
    <div class="screen">
      <header class="screen-head">
        <h1>Ещё</h1>
      </header>

      <h2 class="group-title">Мои данные</h2>
      <div class="group">
        <Row page="report" icon="report" tone="report" title="Отчёт для врача" sub="Сводка на один лист A4, PDF" />
        <Row page="metrics" icon="metric" tone="metric" title="Анализы и показатели" sub="Результаты анализов, вес — с графиком" />
        <Row page="backup" icon="backup" tone="backup" title="Резервная копия" sub="Сохранить в «Файлы», восстановить, таблицы" />
      </div>

      <h2 class="group-title">Настройка</h2>
      <div class="group">
        <Row page="catalog" icon="catalog" tone="catalog" title="Справочник" sub="Лекарства, еда, симптомы, курсы приёма" />
        <Row page="settings" icon="settings" tone="settings" title="Настройки" sub="Тема, граница дня, анализ, удаление" />
      </div>

      <StorageStatus />

      {!isDemo() && (
        <div class="group">
          <button type="button" class="row-btn" onClick={startDemo}>
            <IconBadge name="sparkle" tone="mood" size={34} />
            <span class="row-main">
              <span class="row-title">Посмотреть демо</span>
              <span class="row-sub">Как выглядит анализ на вымышленных данных</span>
            </span>
            <Icon name="chevron" size={16} class="chev" />
          </button>
        </div>
      )}

      <p class="muted small" style={{ textAlign: 'center', margin: '4px 0 0' }}>
        Записи хранятся только на этом телефоне и никуда не отправляются.
        <br />
        {APP_NAME}, версия {APP_VERSION}
      </p>
    </div>
  );
}
