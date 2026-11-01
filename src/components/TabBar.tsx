import { Icon } from './Icon';

export type Tab = 'today' | 'calendar' | 'insights' | 'more';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'today', label: 'Сегодня', icon: 'today' },
  { id: 'calendar', label: 'Календарь', icon: 'calendar' },
  { id: 'insights', label: 'Анализ', icon: 'insights' },
  { id: 'more', label: 'Ещё', icon: 'more' },
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
          <Icon name={t.icon} size={25} />
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
