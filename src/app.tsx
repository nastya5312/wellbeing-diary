import { useEffect, useState } from 'preact/hooks';
import { UpdateToast } from './components/UpdateToast';
import { Notices } from './components/Notices';
import { TabBar, type Tab } from './components/TabBar';
import { Today } from './screens/Today';
import { CalendarTab } from './screens/Calendar';
import { More, type MorePage } from './screens/More';
import { Placeholder } from './screens/Placeholder';
import { getDb } from './db/schema';
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
        {tab === 'insights' && <Placeholder title="Анализ" text="Анализ появится на этапах 5–7." />}
        {tab === 'more' && <More page={morePage} setPage={setMorePage} />}
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
