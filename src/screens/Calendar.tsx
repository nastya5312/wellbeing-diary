import { useState } from 'preact/hooks';
import type { Settings } from '../models/types';
import { getDb } from '../db/schema';
import { listDays, listEventsRange } from '../db/repo';
import { Today } from './Today';
import { Trends } from './Trends';
import { useLive } from '../lib/useLive';
import { dayCategories, monthGrid } from '../lib/trends';
import { formatDateLong } from '../lib/dates';

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export function CalendarTab({ today, settings, onOpenCatalog }: { today: string; settings: Settings; onOpenCatalog: () => void }) {
  const [view, setView] = useState<'month' | 'trends'>('month');
  const [selected, setSelected] = useState<string | null>(null);
  const [ym, setYm] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) }));

  if (selected) {
    return <Today date={selected} today={today} settings={settings} onOpenCatalog={onOpenCatalog} onBack={() => setSelected(null)} />;
  }

  return (
    <div class="screen">
      <header class="screen-head">
        <h1>{view === 'month' ? 'Календарь' : 'Графики'}</h1>
      </header>
      <div class="segmented" role="tablist" aria-label="Вид">
        <button type="button" role="tab" aria-selected={view === 'month'} class={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>
          Месяц
        </button>
        <button type="button" role="tab" aria-selected={view === 'trends'} class={view === 'trends' ? 'active' : ''} onClick={() => setView('trends')}>
          Графики
        </button>
      </div>
      {view === 'month' ? <Month today={today} ym={ym} setYm={setYm} onPick={setSelected} /> : <Trends today={today} />}
    </div>
  );
}

function Month({ today, ym, setYm, onPick }: {
  today: string;
  ym: { y: number; m: number };
  setYm: (v: { y: number; m: number }) => void;
  onPick: (date: string) => void;
}) {
  const db = getDb();
  const weeks = monthGrid(ym.y, ym.m);
  const flat = weeks.flat().filter((d): d is string => !!d);
  const from = flat[0]!;
  const to = flat[flat.length - 1]!;
  const data = useLive(async () => {
    const [days, events] = await Promise.all([listDays(db, from, to), listEventsRange(db, from, to)]);
    return { days: new Map(days.map((d) => [d.date, d])), events };
  }, [from, to]);

  const shift = (delta: number) => {
    const m0 = ym.m - 1 + delta;
    setYm({ y: ym.y + Math.floor(m0 / 12), m: ((m0 % 12) + 12) % 12 + 1 });
  };
  const isFutureMonth = `${ym.y}-${String(ym.m).padStart(2, '0')}` >= today.slice(0, 7);

  const completedCount = data ? flat.filter((d) => data.days.get(d)?.completed).length : 0;

  return (
    <section>
      <div class="month-nav">
        <button type="button" class="icon-btn" aria-label="Предыдущий месяц" onClick={() => shift(-1)}>
          ‹
        </button>
        <h2>
          {MONTHS[ym.m - 1]} {ym.y}
        </h2>
        <button type="button" class="icon-btn" aria-label="Следующий месяц" disabled={isFutureMonth} onClick={() => shift(1)}>
          ›
        </button>
      </div>
      <div class="cal-grid" role="grid" aria-label={`${MONTHS[ym.m - 1]} ${ym.y}`}>
        {WEEKDAYS.map((w) => (
          <div key={w} class="cal-wd" role="columnheader">
            {w}
          </div>
        ))}
        {weeks.flat().map((d, i) => {
          if (!d) return <div key={`e${i}`} class="cal-cell empty" />;
          const day = data?.days.get(d);
          const evs = data?.events.filter((e) => e.date === d) ?? [];
          const cat = dayCategories(evs);
          const future = d > today;
          const flow = (day?.flow ?? 0) > 0;
          const parts = [
            formatDateLong(d),
            day?.completed ? 'заполнен' : '',
            flow ? 'месячные' : '',
            cat.symptom ? 'симптомы' : '',
            cat.med ? 'лекарства или добавки' : '',
            cat.food ? 'еда или напитки' : '',
          ].filter(Boolean);
          return (
            <button
              type="button"
              key={d}
              role="gridcell"
              class={`cal-cell${d === today ? ' today' : ''}${day?.completed ? ' done' : ''}${flow ? ' flow' : ''}`}
              disabled={future}
              aria-label={parts.join(', ')}
              onClick={() => onPick(d)}
            >
              <span class="cal-num">{Number(d.slice(8))}</span>
              {day?.completed && (
                <span class="cal-check" aria-hidden="true">
                  ✓
                </span>
              )}
              <span class="cal-dots" aria-hidden="true">
                {cat.symptom && <i class="dot d-symptom" />}
                {cat.med && <i class="dot d-med" />}
                {cat.food && <i class="dot d-food" />}
              </span>
            </button>
          );
        })}
      </div>
      <div class="legend small cal-legend">
        <span class="legend-item"><i class="dot d-symptom" /> симптомы</span>
        <span class="legend-item"><i class="dot d-med" /> лекарства, добавки</span>
        <span class="legend-item"><i class="dot d-food" /> еда, напитки</span>
        <span class="legend-item"><span class="legend-flow" /> месячные</span>
        <span class="legend-item">✓ день заполнен</span>
      </div>
      <p class="muted small">
        Заполнено дней в этом месяце: {completedCount}. Нажми на день, чтобы посмотреть или дописать его.
      </p>
    </section>
  );
}
