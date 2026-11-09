import { useState } from 'preact/hooks';
import type { DiaryEvent, Item, ItemKind, Settings } from '../models/types';
import { getDb } from '../db/schema';
import { deleteEvent, getDay, hasAnyData, listEventsByDate, listFlowDates, saveDay, unfinishedYesterday } from '../db/repo';
import { QuickAdd } from './QuickAdd';
import { SleepCheckin } from './SleepCheckin';
import { EveningCheckin } from './EveningCheckin';
import { NoteSheet } from './NoteSheet';
import { StoolSheet } from './StoolSheet';
import { medIntervals } from '../lib/intervals';
import { SwipeRow } from '../components/SwipeRow';
import { Checklist } from '../components/Checklist';
import { DailyMetrics } from '../components/DailyMetrics';
import { WhyPanel } from '../components/WhyPanel';
import { QuickLine } from '../components/QuickLine';
import { useForecast } from '../components/CyclePanel';
import { METHOD_LABEL } from '../lib/ovulation';
import { Icon, IconBadge } from '../components/Icon';
import { useLive } from '../lib/useLive';
import { safe, notify } from '../lib/notify';
import { cycleDay } from '../lib/cycle';
import { backupOverdue } from '../lib/backup';
import { BACKUP_REMIND_DAYS } from '../db/defaults';
import { addDays, formatDateLong, formatDuration, localTime, tsFromDiaryDate, weekdayRu } from '../lib/dates';
import { ENERGY_LABELS, FLOW_LABELS, INTENSITY_LABELS, MOOD_LABELS, QUALITY_LABELS } from '../lib/labels';

type Open =
  | { type: 'add'; kind?: ItemKind }
  | { type: 'edit'; event: DiaryEvent; item: Item }
  | { type: 'sleep' | 'evening' | 'note' | 'stool'; date: string }
  | null;

const QUICK: { kind?: ItemKind; label: string; icon: string }[] = [
  { kind: 'food', label: 'Еда', icon: 'food' },
  { kind: 'drink', label: 'Напиток', icon: 'drink' },
  { kind: 'med', label: 'Лекарство', icon: 'med' },
  { kind: 'supplement', label: 'Добавка', icon: 'supplement' },
  { kind: 'symptom', label: 'Симптом', icon: 'symptom' },
  { label: 'Другое', icon: 'other' },
];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Кольцо прогресса: сколько из четырёх отметок дня внесено. */
function DayRing({ done, total, completed }: { done: number; total: number; completed: boolean }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const part = completed ? 1 : done / total;
  return (
    <div
      class={`ring${completed ? ' ring-done' : ''}`}
      role="img"
      aria-label={completed ? 'День заполнен' : `Отмечено ${done} из ${total}`}
    >
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle class="ring-track" cx="32" cy="32" r={r} fill="none" stroke-width="7" />
        <circle
          class="ring-fill"
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke-width="7"
          stroke-linecap="round"
          stroke-dasharray={c}
          stroke-dashoffset={c * (1 - part)}
        />
      </svg>
      <span class="ring-label">{completed ? <Icon name="check" size={24} /> : `${done}/${total}`}</span>
    </div>
  );
}

// Экран дня. Для сегодняшнего дня — с напоминаниями; для прошлых (из календаря) — с кнопкой «Назад».
export function Today({ date, today, settings, onOpenBackup, onOpenCatalog, onBack }: {
  /** Просматриваемая дата дневника */
  date: string;
  /** Сегодняшняя дата дневника */
  today: string;
  settings: Settings;
  onOpenBackup?: () => void;
  onOpenCatalog: () => void;
  onBack?: () => void;
}) {
  const isToday = date === today;
  const db = getDb();
  const [open, setOpen] = useState<Open>(null);
  const [why, setWhy] = useState<{ id: string; ts: number } | null>(null);
  const [line, setLine] = useState(false);
  const forecast = useForecast(today);
  const ovToday = forecast?.ovulations.find((o) => o.date === date);

  const day = useLive(() => getDay(db, date), [date]);
  const events = useLive(() => listEventsByDate(db, date), [date]);
  const items = useLive(async () => new Map((await db.items.toArray()).map((it) => [it.id, it])), []);
  const cycle = useLive(async () => cycleDay(await listFlowDates(db, addDays(date, -90), date), date), [date]);
  const yesterday = useLive(() => (isToday ? unfinishedYesterday(db, date) : Promise.resolve(null)), [date, isToday]);
  const hasData = useLive(() => hasAnyData(db), []);
  const courses = useLive(() => db.courses.toArray(), []);
  const needBackup = isToday && hasData !== undefined && backupOverdue(settings.lastExportAt, hasData, BACKUP_REMIND_DAYS);

  const close = () => setOpen(null);
  const toggleCompleted = async () => {
    const completed = !day?.completed;
    const ok = await safe(async () => (await saveDay(db, date, { completed }), true));
    if (ok) notify(completed ? 'День заполнен — он попадёт в анализ' : 'Отметка «День заполнен» снята');
  };

  const intervals = events && items ? medIntervals(events, items) : [];
  const sleep = day?.sleep;
  const wb = day?.wellbeing;
  const hasWb = !!(wb?.mood || wb?.energy || wb?.stress || day?.flow);

  const checkins = [
    {
      key: 'sleep' as const,
      label: 'Сон',
      icon: 'moon',
      tone: 'sleep',
      done: !!sleep,
      value: sleep?.durationMin !== undefined ? formatDuration(sleep.durationMin) : sleep ? `${sleep.bedtime ?? '…'}–${sleep.wake ?? '…'}` : null,
      sub: sleep?.quality ? `качество: ${QUALITY_LABELS[sleep.quality - 1]}` : sleep ? 'качество не указано' : null,
      empty: 'Как спала?',
    },
    {
      key: 'evening' as const,
      label: 'Самочувствие',
      icon: 'mood',
      tone: 'mood',
      done: hasWb,
      value: wb?.mood ? cap(MOOD_LABELS[wb.mood - 1]!) : hasWb ? 'Отмечено' : null,
      sub: wb?.energy ? `энергия: ${ENERGY_LABELS[wb.energy - 1]}` : day?.flow ? `месячные: ${FLOW_LABELS[day.flow]}` : null,
      empty: 'Настроение, энергия',
    },
    {
      key: 'stool' as const,
      label: 'Стул',
      icon: 'stool',
      tone: 'stool',
      done: !!day?.stool,
      value: day?.stool ? (day.stool.count === 0 ? 'Не было' : `${day.stool.count >= 5 ? '5+' : day.stool.count} раз`) : null,
      sub: day?.stool?.type ? `тип ${day.stool.type} по шкале` : null,
      empty: 'Сколько раз',
    },
    {
      key: 'note' as const,
      label: 'Заметка',
      icon: 'note',
      tone: 'note',
      done: !!day?.note,
      value: day?.note ? (day.note.length > 38 ? `${day.note.slice(0, 36).trim()}…` : day.note) : null,
      sub: null,
      empty: 'Что было необычного',
    },
  ];
  const doneCount = checkins.filter((c) => c.done).length;

  return (
    <div class="screen">
      <header class="day-head">
        <div class="grow">
          {onBack ? (
            <button type="button" class="icon-btn back-btn" onClick={onBack} aria-label="Назад к календарю">
              <Icon name="back" size={20} /> Календарь
            </button>
          ) : (
            <p class="day-kicker">Сегодня</p>
          )}
          <h1 class="day-title">
            {formatDateLong(date)}
            {!isToday && date.slice(0, 4) !== today.slice(0, 4) ? ` ${date.slice(0, 4)}` : ''}
          </h1>
          <div class="day-meta">
            <span class="pill">{cap(weekdayRu(date))}</span>
            {cycle ? (
              <span class="pill tone-cycle">
                <Icon name="drop" size={14} /> День цикла {cycle}
              </span>
            ) : null}
            {ovToday && (
              <span class="pill tone-cycle">
                <Icon name="sparkle" size={14} /> Овуляция ({METHOD_LABEL[ovToday.method]})
              </span>
            )}
            {!isToday && <span class="pill">Запись задним числом</span>}
          </div>
        </div>
        <DayRing done={doneCount} total={checkins.length} completed={!!day?.completed} />
      </header>

      {isToday && hasData === false && onOpenBackup && (
        <button type="button" class="banner banner-info" onClick={onOpenBackup}>
          <IconBadge name="backup" tone="accent" size={32} />
          <span class="grow">
            Уже вела дневник раньше? <u>Восстановить из копии</u>
          </span>
          <Icon name="chevron" size={18} class="chev" />
        </button>
      )}

      {needBackup && onOpenBackup && (
        <button type="button" class="banner" onClick={onOpenBackup}>
          <IconBadge name="backup" tone="warn" size={32} />
          <span class="grow">
            {settings.lastExportAt === undefined ? 'Резервной копии ещё нет.' : `Копии нет больше ${BACKUP_REMIND_DAYS} дней.`}{' '}
            <u>Сохранить копию</u>
          </span>
          <Icon name="chevron" size={18} class="chev" />
        </button>
      )}

      {yesterday && (
        <button type="button" class="banner banner-info" onClick={() => setOpen({ type: 'evening', date: yesterday })}>
          <IconBadge name="calendar" tone="accent" size={32} />
          <span class="grow">
            Вчерашний день не отмечен заполненным. <u>Заполнить</u>
          </span>
          <Icon name="chevron" size={18} class="chev" />
        </button>
      )}

      <section class="checkins" aria-label="Отметки дня">
        {checkins.map((c) => (
          <button type="button" key={c.key} class="checkin" onClick={() => setOpen({ type: c.key, date })}>
            <IconBadge name={c.icon} tone={c.tone} size={36} />
            {c.done && (
              <span class="checkin-done" aria-hidden="true">
                <Icon name="check" size={14} />
              </span>
            )}
            <span class="checkin-text">
              <span class="checkin-label">{c.label}</span>
              {c.value ? (
                <span class="checkin-value">{c.value}</span>
              ) : (
                <span class="checkin-value empty">{c.empty}</span>
              )}
              {c.sub && <span class="checkin-sub">{c.sub}</span>}
            </span>
          </button>
        ))}
      </section>

      {items && events && courses && (
        <>
          <h2 class="section-title">Чек-лист</h2>
          <Checklist
            date={date}
            tsFor={() => (isToday ? Date.now() : tsFromDiaryDate(date, '12:00', settings.dayStartsAt))}
            items={[...items.values()]}
            events={events}
            courses={courses}
            onEmptyHint={onOpenCatalog}
            dayStartsAt={settings.dayStartsAt}
          />
        </>
      )}

      <h2 class="section-title">Добавить запись</h2>
      <button type="button" class="ql-open" onClick={() => setLine(true)}>
        <Icon name="note" size={20} />
        <span class="grow">Написать или надиктовать одной строкой</span>
        <span class="muted small">кофе, овсянка…</span>
      </button>
      <div class="quick-row">
        {QUICK.map((q) => (
          <button type="button" key={q.label} class="quick" onClick={() => setOpen({ type: 'add', kind: q.kind })}>
            <IconBadge name={q.icon} tone={q.kind ?? 'other'} size={48} />
            <span>{q.label}</span>
          </button>
        ))}
      </div>

      <DailyMetrics date={date} />

      <h2 class="section-title">Записи за день</h2>
      {events && events.length === 0 && (
        <p class="muted section-note">Пока пусто. Отметь что-нибудь в чек-листе или добавь запись кнопками выше.</p>
      )}
      {events && events.length > 0 && (
        <>
          <ul class="timeline">
            {events.map((ev) => {
              const it = items?.get(ev.itemId);
              const name = it?.name ?? 'удалённая позиция';
              const details = [ev.intensity && INTENSITY_LABELS[ev.intensity - 1], ev.amountText, ev.note].filter(Boolean);
              return (
                <li key={ev.id}>
                  <SwipeRow
                    label={`${localTime(ev.ts)} ${name}. Нажми, чтобы изменить`}
                    onTap={() => it && setOpen({ type: 'edit', event: ev, item: it })}
                    onDelete={() =>
                      void safe(async () => (await deleteEvent(db, ev.id), true)).then((ok) => ok && notify('Запись удалена'))
                    }
                  >
                    <span class="ev-time">{localTime(ev.ts)}</span>
                    <span class="ev-icon">
                      <IconBadge name={ev.kind} tone={ev.kind} size={30} />
                    </span>
                    <span class="ev-body grow">
                      <span>{name}</span>
                      {details.length > 0 && <span class="muted small">{details.join(', ')}</span>}
                    </span>
                  </SwipeRow>
                </li>
              );
            })}
          </ul>
          <p class="muted small section-note">Касание — изменить, смахивание влево — удалить.</p>
        </>
      )}

      {(() => {
        // Симптомы этого дня — для разбора «Почему так?» (последняя отметка каждого)
        const sym = new Map<string, number>();
        for (const e of events ?? []) if (e.kind === 'symptom') sym.set(e.itemId, Math.max(sym.get(e.itemId) ?? 0, e.ts));
        if (!sym.size) return null;
        return (
          <section class="why-card">
            <span class="card-title">
              <IconBadge name="insights" tone="symptom" size={30} /> Почему так?
            </span>
            <span class="muted small">Что было перед симптомом и что раньше чаще всего ему предшествовало.</span>
            <div class="chips">
              {[...sym].map(([id, ts]) => (
                <button type="button" key={id} class="chip" onClick={() => setWhy({ id, ts })}>
                  {items?.get(id)?.name ?? 'симптом'}
                </button>
              ))}
            </div>
          </section>
        );
      })()}

      {intervals.length > 0 && (
        <div class="card">
          <span class="card-title">
            <IconBadge name="clock" tone="med" size={28} /> Интервалы после лекарств
          </span>
          {intervals.map((iv) => (
            <span key={iv.eventId} class="small">
              {iv.medName}, {iv.medTime} →{' '}
              {iv.next ? `${iv.next.name}, ${iv.next.time} (через ${formatDuration(iv.next.minutes)})` : 'еды и напитков после не было'}
            </span>
          ))}
          <span class="muted small">Считается первая еда или напиток, кроме воды.</span>
        </div>
      )}

      <section class={`finish${day?.completed ? ' done' : ''}`}>
        <span class="finish-title">
          {day?.completed ? <Icon name="check" size={22} /> : <Icon name="sparkle" size={22} />}
          {day?.completed ? 'День заполнен' : 'Всё внесла за день?'}
        </span>
        <p class="muted small">
          {day?.completed
            ? 'День учитывается в анализе. Можно дописывать — отметка останется.'
            : 'В анализ попадают только заполненные дни: так приложение отличает «не было» от «не записала».'}
        </p>
        <button
          type="button"
          class={`btn btn-block btn-large${day?.completed ? '' : ' btn-primary'}`}
          aria-pressed={!!day?.completed}
          onClick={toggleCompleted}
        >
          {day?.completed ? 'Снять отметку' : 'День заполнен'}
        </button>
      </section>

      {open?.type === 'add' && <QuickAdd settings={settings} date={date} kind={open.kind} onClose={close} />}
      {open?.type === 'edit' && <QuickAdd settings={settings} date={date} edit={open} onClose={close} />}
      {open?.type === 'sleep' && <SleepCheckin date={open.date} onClose={close} />}
      {open?.type === 'evening' && <EveningCheckin date={open.date} onClose={close} />}
      {open?.type === 'note' && <NoteSheet date={open.date} onClose={close} />}
      {open?.type === 'stool' && <StoolSheet date={open.date} onClose={close} />}
      {line && (
        <QuickLine
          date={date}
          dayStartsAt={settings.dayStartsAt}
          defaultTs={() => (isToday ? Date.now() : tsFromDiaryDate(date, '12:00', settings.dayStartsAt))}
          onClose={() => setLine(false)}
        />
      )}
      {why && <WhyPanel symptomId={why.id} focusTs={why.ts} onClose={() => setWhy(null)} />}
    </div>
  );
}
