import { useState } from 'preact/hooks';
import type { Item } from '../models/types';
import { getDb } from '../db/schema';
import { courseStatus, deleteCourse, endCourse, listCourses, startCourse } from '../db/courses';
import { useLive } from '../lib/useLive';
import { safe, notify } from '../lib/notify';
import { formatDateRu, localDate } from '../lib/dates';

// Курс приёма: «принимаю с …» / «на паузе с …». Нужен, чтобы анализ сравнивал периоды до и после.
export function CoursePanel({ item }: { item: Item }) {
  const db = getDb();
  const today = localDate(new Date());
  const courses = useLive(() => listCourses(db, item.id), [item.id]);
  const [date, setDate] = useState(today);
  if (!courses) return null;

  const open = courses.find((c) => c.end === undefined);
  const status = courseStatus(courses, today);

  const start = async () => {
    const ok = await safe(async () => (await startCourse(db, item.id, date), true));
    if (ok) notify(`Приём с ${formatDateRu(date)}`);
  };
  const pause = async () => {
    if (!open) return;
    const ok = await safe(async () => (await endCourse(db, open.id, date), true));
    if (ok) notify(`Пауза после ${formatDateRu(date)}`);
  };

  return (
    <section class="panel">
      <h2>Курс приёма</h2>
      <p class="small">
        {status === null && 'Курс не отмечен. Отметь начало, если важно сравнивать периоды «до» и «после».'}
        {status === 'active' && open && `Принимаю с ${formatDateRu(open.start)}.`}
        {status === 'paused' && 'Сейчас на паузе.'}
      </p>
      <div class="row">
        <label class="field grow">
          <span>{open ? 'Последний день приёма' : 'Дата начала'}</span>
          <input type="date" value={date} onInput={(e) => e.currentTarget.value && setDate(e.currentTarget.value)} />
        </label>
        {open ? (
          <button type="button" class="btn" onClick={pause}>
            На паузу
          </button>
        ) : (
          <button type="button" class="btn" onClick={start}>
            Начать
          </button>
        )}
      </div>
      {courses.length > 0 && (
        <ul class="list small">
          {[...courses].reverse().map((c) => (
            <li key={c.id} class="row center course-row">
              <span class="grow">
                {formatDateRu(c.start)} — {c.end ? formatDateRu(c.end) : 'сейчас'}
              </span>
              <button
                type="button"
                class="icon-btn icon-small"
                aria-label="Удалить запись о курсе"
                onClick={() => confirm('Удалить запись о курсе? Отметки приёма останутся.') && void safe(() => deleteCourse(db, c.id))}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
