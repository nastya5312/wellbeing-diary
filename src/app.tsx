import { useEffect, useState } from 'preact/hooks';
import { UpdateToast } from './components/UpdateToast';
import { Notices } from './components/Notices';
import { TabBar, type Tab } from './components/TabBar';
import { Today } from './screens/Today';
import { CalendarTab } from './screens/Calendar';
import { More, type MorePage } from './screens/More';
import { Insights } from './screens/Insights';
import { cleanupLegacyDemo, getDb } from './db/schema';
import { getSettings } from './db/repo';
import { diaryDate } from './lib/dates';
import { useLive } from './lib/useLive';
import { requestPersistentStorage } from './lib/storage';

export function App() {
  const [tab, setTab] = useState<Tab>('today');
  const [morePage, setMorePage] = useState<MorePage>('menu');
  const settings = useLive(() => getSettings(getDb()), []);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    void requestPersistentStorage();
    cleanupLegacyDemo();
    // Дата «сегодня» обновляется, когда приложение снова открывают (например, утром) и раз в минуту
    const tick = () => setNow(Date.now());
    const onVisible = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onVisible);
    const id = setInterval(tick, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(id);
    };
  }, []);

  // Тема из настроек: «как в iPhone» — без атрибута, иначе принудительно
  const theme = settings?.theme;
  useEffect(() => {
    const root = document.documentElement;
    if (!theme || theme === 'auto') delete root.dataset.theme;
    else root.dataset.theme = theme;
  }, [theme]);

  const today = settings ? diaryDate(now, settings.dayStartsAt) : null;
  const openMore = (page: MorePage) => {
    setMorePage(page);
    setTab('more');
  };

  return (
    <div class="app">
      <main class="app-main">
        {settings && today && tab === 'today' && (
          <Today
            date={today}
            today={today}
            settings={settings}
            onOpenBackup={() => openMore('backup')}
            onOpenCatalog={() => openMore('catalog')}
          />
        )}
        {settings && today && tab === 'calendar' && (
          <CalendarTab today={today} settings={settings} onOpenCatalog={() => openMore('catalog')} />
        )}
        {tab === 'insights' && <Insights today={today ?? undefined} onOpenReport={() => openMore('report')} />}
        {settings && today && tab === 'more' && <More page={morePage} setPage={setMorePage} today={today} settings={settings} />}
      </main>
      <TabBar
        tab={tab}
        onChange={(t) => {
          if (t === 'more') setMorePage('menu');
          setTab(t);
        }}
      />
      <Notices />
      <UpdateToast />
    </div>
  );
}
