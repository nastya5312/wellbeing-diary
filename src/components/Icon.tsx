// Набор линейных иконок одного стиля (24×24, обводка). Без шрифтов и внешних файлов.
const P: Record<string, string> = {
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z',
  mood: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8.5 14.2c.9 1.3 2.1 1.9 3.5 1.9s2.6-.6 3.5-1.9M9 9.6h.01M15 9.6h.01',
  food: 'M6 3v6.5a2 2 0 0 0 4 0V3M8 3v18M17.5 21V3C15.5 4.5 14.5 7 14.5 10v3h3',
  drink: 'M5 8h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5V8ZM16 9.5h1.5a2.5 2.5 0 0 1 0 5H16M8 3v2.5M11.5 3v2.5M4 21h14',
  med: 'M10.5 20.5 20.5 10.5a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7ZM8.5 8.5l7 7',
  supplement: 'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10ZM2 21c0-3 1.9-5.4 5.1-6 2.4-.5 4.9-2 5.9-3',
  symptom: 'M3 12h4l3-8 4 16 3-8h4',
  activity: 'M13.5 5.5a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5ZM9 21l2.5-6 3 3v3M11.5 15l-1-5.5 4.5 2 2 3M10.5 9.5 7.5 11.5 6.5 14.5',
  other: 'M5 12h.01M12 12h.01M19 12h.01',
  stool: 'M3.5 8.5c2.8 0 2.8 2 5.6 2s2.8-2 5.6-2 2.8 2 5.8 2M3.5 14.5c2.8 0 2.8 2 5.6 2s2.8-2 5.6-2 2.8 2 5.8 2',
  note: 'M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4',
  metric: 'M4 20h16M7 20v-7M12 20V5M17 20v-10',
  today: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4',
  calendar: 'M4 7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7ZM4 9.5h16M8.5 2.5v3M15.5 2.5v3',
  insights: 'M3 17.5l5-5.5 4 3.5 8.5-9M15 6.5h5.5V12',
  more: 'M5 5h5v5H5V5ZM14 5h5v5h-5V5ZM5 14h5v5H5v-5ZM14 14h5v5h-5v-5Z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  plus: 'M12 5v14M5 12h14',
  chevron: 'M9.5 6l6 6-6 6',
  back: 'M14.5 6l-6 6 6 6',
  close: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
  backup: 'M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5M5 20.5h14',
  report: 'M7 3h7l5 5v13H7V3ZM14 3v5h5M10 13h6M10 17h6',
  catalog: 'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5v-15ZM5 19.5A1.5 1.5 0 0 0 6.5 21H19M9 7.5h6',
  settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
  shield: 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3ZM8.8 12.2l2.2 2.2 4.2-4.4',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3.2 2',
  drop: 'M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11Z',
  alert: 'M12 4 2.8 19.5h18.4L12 4ZM12 10v4.5M12 17.3h.01',
  sparkle: 'M12 3.5 13.8 10 20.5 12 13.8 14 12 20.5 10.2 14 3.5 12 10.2 10 12 3.5Z',
  refresh: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4',
  trash: 'M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13',
  repeat: 'M4 9.5h13l-3-3M20 14.5H7l3 3',
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 22, class: cls }: { name: IconName | string; size?: number; class?: string }) {
  const d = P[name] ?? P.other!;
  const dotted = name === 'other';
  return (
    <svg
      class={`icon${cls ? ` ${cls}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={dotted ? 3 : 1.8}
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}

/** Иконка в цветном квадрате категории (как в настройках iOS). */
export function IconBadge({ name, tone, size = 34 }: { name: IconName | string; tone: string; size?: number }) {
  return (
    <span class={`ibadge tone-${tone}`} style={{ width: `${size}px`, height: `${size}px` }} aria-hidden="true">
      <Icon name={name} size={Math.round(size * 0.58)} />
    </span>
  );
}
