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
import { useLive } from '../lib/useLive';
import { safe, notify } from '../lib/notify';
import { cycleDay } from '../lib/cycle';
import { backupOverdue } from '../lib/backup';
import { BACKUP_REMIND_DAYS } from '../db/defaults';
import { addDays, formatDateLong, formatDuration, localTime, tsFromDiaryDate, weekdayRu } from '../lib/dates';
import { BRISTOL_LABELS, ENERGY_LABELS, INTENSITY_LABELS, KIND_ICON, MOOD_LABELS, QUALITY_LABELS, STRESS_LABELS } from '../lib/labels';

type Open =
  | { type: 'add'; kind?: ItemKind }
  | { type: 'edit'; event: DiaryEvent; item: Item }
  | { type: 'sleep' | 'evening' | 'note' | 'stool'; date: string }
  | null;

const ADD_TILES: { kind: ItemKind; label: string }[] = [
  { kind: 'food', label: 'Еда' },
  { kind: 'drink', label: 'Напиток' },
  { kind: 'med', label: 'Лекарство' },
  { kind: 'supplement', label: 'Добавка' },
  { kind: 'symptom', label: 'Симптом' },
];

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
    if (ok) notify(completed ? 'День отмечен заполненным' : 'Отметка снята');
  };

  const intervals = events && items ? medIntervals(events, items) : [];
  const sleep = day?.sleep;
  const wb = day?.wellbeing;

  return (
    <div class="screen">
      <header class={`screen-head${onBack ? ' row center' : ''}`}>
        {onBack && (
          <button type="button" class="icon-btn" onClick={onBack} aria-label="Назад к календарю">
            ‹
          </button>
        )}
        <div>
        <h1>
          {isToday ? 'Сегодня, ' : ''}
          {formatDateLong(date)}
          {!isToday && date.slice(0, 4) !== today.slice(0, 4) ? ` ${date.slice(0, 4)}` : ''}
        </h1>
        <p class="muted">
          {weekdayRu(date)}
          {cycle ? ` · день цикла ${cycle}` : ''}
          {!isToday && ' · запись задним числом'}
        </p>
        </div>
      </header>

      {needBackup && onOpenBackup && (
        <button type="button" class="banner" onClick={onOpenBackup}>
          {settings.lastExportAt === undefined
            ? 'Резервной копии ещё нет. '
            : `Последняя копия была больше ${BACKUP_REMIND_DAYS} дней назад. `}
          <u>Сохранить копию</u>
        </button>
      )}

      {yesterday && (
        <button type="button" class="banner" onClick={() => setOpen({ type: 'evening', date: yesterday })}>
          Вчера не отмечен. <u>Заполнить?</u>
        </button>
      )}

      {items && events && courses && (
        <Checklist
          date={date}
          tsFor={() => (isToday ? Date.now() : tsFromDiaryDate(date, '12:00', settings.dayStartsAt))}
          items={[...items.values()]} events={events} courses={courses} onEmptyHint={onOpenCatalog}
          dayStartsAt={settings.dayStartsAt} />
      )}

      <DailyMetrics date={date} />

      <h2 class="section-title">Добавить</h2>
      <div class="tiles">
        <button type="button" class="tile" onClick={() => setOpen({ type: 'sleep', date: date })}>
          <span class="tile-icon" aria-hidden="true">🌙</span>
          <span>Сон</span>
        </button>
        <button type="button" class="tile" onClick={() => setOpen({ type: 'evening', date: date })}>
          <span class="tile-icon" aria-hidden="true">🙂</span>
          <span>Самочувствие</span>
        </button>
        {ADD_TILES.map((t) => (
          <button type="button" key={t.kind} class="tile" onClick={() => setOpen({ type: 'add', kind: t.kind })}>
            <span class="tile-icon" aria-hidden="true">{KIND_ICON[t.kind]}</span>
            <span>{t.label}</span>
          </button>
        ))}
        <button type="button" class="tile" onClick={() => setOpen({ type: 'stool', date: date })}>
          <span class="tile-icon" aria-hidden="true">🧻</span>
          <span>Стул</span>
        </button>
        <button type="button" class="tile" onClick={() => setOpen({ type: 'note', date: date })}>
          <span class="tile-icon" aria-hidden="true">✎</span>
          <span>Заметка</span>
        </button>
      </div>
      <button type="button" class="btn btn-link" onClick={() => setOpen({ type: 'add' })}>
        + Другое событие (активность и прочее)
      </button>

      {(sleep || wb || day?.flow || day?.note || day?.stool || intervals.length > 0) && (
        <section class="cards">
          {sleep && (
            <button type="button" class="card" onClick={() => setOpen({ type: 'sleep', date: date })}>
              <span class="card-title">🌙 Сон</span>
              <span>
                {sleep.bedtime}–{sleep.wake}
                {sleep.durationMin !== undefined && ` · ${formatDuration(sleep.durationMin)}`}
              </span>
              <span class="muted small">
                {sleep.quality ? `качество: ${QUALITY_LABELS[sleep.quality - 1]}` : 'качество не указано'}
                {sleep.awakenings ? ` · пробуждений: ${sleep.awakenings}` : ''}
              </span>
            </button>
          )}
          {(wb || day?.flow) && (
            <button type="button" class="card" onClick={() => setOpen({ type: 'evening', date: date })}>
              <span class="card-title">🙂 Самочувствие</span>
              <span class="small">
                {[
                  wb?.mood && `настроение: ${MOOD_LABELS[wb.mood - 1]}`,
                  wb?.energy && `энергия: ${ENERGY_LABELS[wb.energy - 1]}`,
                  wb?.stress && `стресс: ${STRESS_LABELS[wb.stress - 1]}`,
                  day?.flow ? `месячные: ${day.flow}/3` : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </button>
          )}
          {day?.stool && (
            <button type="button" class="card" onClick={() => setOpen({ type: 'stool', date: date })}>
              <span class="card-title">🧻 Стул</span>
              <span class="small">
                {day.stool.count === 0 ? 'не было' : `${day.stool.count >= 5 ? '5+' : day.stool.count} раз`}
                {day.stool.type ? ` · тип ${day.stool.type}: ${BRISTOL_LABELS[day.stool.type - 1]}` : ''}
              </span>
            </button>
          )}
          {intervals.length > 0 && (
            <div class="card">
              <span class="card-title">⏱ Интервалы после лекарств</span>
              {intervals.map((iv) => (
                <span key={iv.eventId} class="small">
                  {iv.medName} {iv.medTime} →{' '}
                  {iv.next ? `${iv.next.name} ${iv.next.time} (через ${formatDuration(iv.next.minutes)})` : 'дальше еды и напитков в этот день нет'}
                </span>
              ))}
              <span class="muted small">Первая еда или напиток (кроме воды) после приёма. Время меняется касанием записи ниже.</span>
            </div>
          )}
          {day?.note && (
            <button type="button" class="card" onClick={() => setOpen({ type: 'note', date: date })}>
              <span class="card-title">✎ Заметка</span>
              <span class="small pre">{day.note}</span>
            </button>
          )}
        </section>
      )}

      <section>
        <h2 class="section-title">Записи за день</h2>
        {events && events.length === 0 && <p class="muted">Пока пусто. Добавь первое событие плитками выше.</p>}
        {events && events.length > 0 && (
          <ul class="list events">
            {events.map((ev) => {
              const it = items?.get(ev.itemId);
              const name = it?.name ?? 'удалённая позиция';
              const details = [
                ev.intensity && INTENSITY_LABELS[ev.intensity - 1],
                ev.amountText,
                ev.note,
              ].filter(Boolean);
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
                    <span class="ev-icon" aria-hidden="true">{KIND_ICON[ev.kind]}</span>
                    <span class="ev-body">
                      <span>{name}</span>
                      {details.length > 0 && <span class="muted small">{details.join(' · ')}</span>}
                    </span>
                  </SwipeRow>
                </li>
              );
            })}
          </ul>
        )}
        {events && events.length > 0 && <p class="muted small">Свайп влево — удалить, касание — изменить.</p>}
      </section>

      <button
        type="button"
        class={`btn btn-block btn-complete${day?.completed ? ' done' : ' btn-primary'}`}
        aria-pressed={!!day?.completed}
        onClick={toggleCompleted}
      >
        {day?.completed ? '✓ День заполнен (нажми, чтобы снять)' : 'День заполнен'}
      </button>

      {open?.type === 'add' && <QuickAdd settings={settings} date={date} kind={open.kind} onClose={close} />}
      {open?.type === 'edit' && <QuickAdd settings={settings} date={date} edit={open} onClose={close} />}
      {open?.type === 'sleep' && <SleepCheckin date={open.date} onClose={close} />}
      {open?.type === 'evening' && <EveningCheckin date={open.date} onClose={close} />}
      {open?.type === 'note' && <NoteSheet date={open.date} onClose={close} />}
      {open?.type === 'stool' && <StoolSheet date={open.date} onClose={close} />}
    </div>
  );
}
