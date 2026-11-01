export type Tab = 'today' | 'calendar' | 'insights' | 'more';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'today', label: 'Сегодня', icon: '◉' },
  { id: 'calendar', label: 'Календарь', icon: '▦' },
  { id: 'insights', label: 'Анализ', icon: '◇' },
  { id: 'more', label: 'Ещё', icon: '⋯' },
];

export function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav class="tabbar" aria-label="Разделы">
      {TABS.map((t) => (
        <button
          type="button"
          key={t.id}
          class={`tab${tab === t.id ? ' active' : ''}`}
          aria-current={tab === t.id ? 'page' : undefined}
          onClick={() => onChange(t.id)}
        >
          <span class="tab-icon" aria-hidden="true">
            {t.icon}
          </span>
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
